class BaseView extends Croquet.View {
    constructor(model) {
        super(model);
        this.model = model;

        window.view = this;

        this.textEncoder = new TextEncoder();
        this.textDecoder = new TextDecoder();
        
        if(localStorage.getItem("secretKey") !== null) {
            const secretKey = new Uint8Array(JSON.parse(localStorage.getItem("secretKey")));
            this.keyPair = nacl.sign.keyPair.fromSecretKey(secretKey);
        }
        else {
            this.keyPair = nacl.sign.keyPair();
            localStorage.setItem("secretKey", JSON.stringify(Array.from(this.keyPair.secretKey)));
        }

        if(this instanceof View)
            navigator.mediaDevices.enumerateDevices()
                .then(devices => {
                    navigator.mediaDevices.getUserMedia({
                        audio : true,
                        video : true || devices.find(device => device.kind == "videoinput" && device.label == "Logi Capture"),
                    }).then(stream => {
                        this.getUserMedia(stream);
                    }).catch(error => {
                        console.error(error);
                    });
                });
        else
            navigator.mediaDevices.getUserMedia({
                audio : true,
                video : true,
            }).then(stream => {
                this.getUserMedia(stream);
            }).catch(error => {
                console.error(error);
            });
    }

    sendOffer({publicKey}, callback = () => {}) {
        this.unsubscribe(this.sessionId, "receive-offer");

        this.peer = new SimplePeer({
            initiator : true,
            trickle : false,
            stream : this.stream,
        });
        this.peer.on("connect", () => {
            this.subscribe(this.sessionId, "receive-offer", this.receiveOffer);
            delete this.peer;

            setTimeout(() => callback(), 100);
        });

        this.peer.on("stream", (stream) => {
            remoteVideo.srcObject = stream;
            
        });

        this.peer.on("signal", offer => {
            console.log("sending offer");

            const data = {
                offerString : JSON.stringify(offer),
                publicKey,
            };
            
            this.publish(this.sessionId, "send-offer", {
                data,
                publicKey : this.keyPair.publicKey,
                signature : nacl.sign.detached(this.textEncoder.encode(JSON.stringify([this.sessionId, "send-offer", data])), this.keyPair.secretKey),
            });

            this.subscribe(this.sessionId, "receive-answer", this.receiveAnswer);
        });
    }
    receiveOffer({publicKey, data}) {
        if(!nacl.verify(data.publicKey, this.keyPair.publicKey)) return;

        if(this instanceof Webcam) {
            document.body.innerText = "receive offer";
        }

        const offer = JSON.parse(data.offerString);

        const webcam = (this.model.peers[JSON.stringify(publicKey)] == undefined);

        this.unsubscribe(this.sessionId, "receive-offer");

        this.peer = new SimplePeer({
            initiator : false,
            trickle : false,
            stream : this.stream,
        });

        this.peer.signal(offer);
        this.peer.on("signal", answer => {
            if(this instanceof Webcam) {
                document.body.innerText = "send answer";
            }

            const data = {
                answerString : JSON.stringify(answer),
                publicKey,
            };

            this.publish(this.sessionId, "send-answer", {
                data,
                publicKey : this.keyPair.publicKey,
                signature : nacl.sign.detached(this.textEncoder.encode(JSON.stringify([this.sessionId, "send-answer", data])), this.keyPair.secretKey),
            });
        });

        this.peer.on("connect", () => {
            delete this.peer;
            this.subscribe(this.sessionId, "receive-offer", this.receiveOffer);
        });

        this.peer.on("stream", stream => {
            if(this instanceof Webcam) return;

            const name = this.model.peers[JSON.stringify(publicKey)];
            if(name !== undefined)
                remoteName.innerText = `(${name})`;

            if(webcam) {
                this.streams.webcam = stream;
                toggleWebcam.disabled = false;

                const data = {
                    publicKey
                };
                this.publish(this.sessionId, "add-webcam", {
                    data,
                    publicKey : this.keyPair.publicKey,
                    signature : nacl.sign.detached(this.textEncoder.encode(JSON.stringify([this.sessionId, "add-webcam", data])), this.keyPair.secretKey),
                });
            }
            else {
                this.streams.remote = stream;
                remoteVideo.srcObject = stream;
            }
        });
    }
    receiveAnswer({publicKey, data}) {
        if(!nacl.verify(data.publicKey, this.keyPair.publicKey)) return;

        const answer = JSON.parse(data.answerString);
        this.peer.signal(answer);
        this.unsubscribe(this.sessionId, "receive-answer");
    }
}

class View extends BaseView {
    constructor(model) {
        super(model);

        this.streams = {
            local : undefined,
            remote : undefined,
            webcam : undefined,
        };

        this.webcam = false;
        toggleWebcam.addEventListener("click", event => {
            this.webcam = !this.webcam;

            localVideo.srcObject = this.webcam?
                this.streams.webcam :
                this.streams.local;
        });
        
        this.publish(this.sessionId, "add-peer", {
            publicKey : this.keyPair.publicKey,
            signature : nacl.sign.detached(this.textEncoder.encode(JSON.stringify([this.sessionId, "add-peer"])), this.keyPair.secretKey),
        });
        this.subscribe(this.sessionId, "add-peer", this.addPeer);

        window.addEventListener("beforeunload", event => {
            this.publish(this.sessionId, "remove-peer", {
                publicKey : this.keyPair.publicKey,
                signature : nacl.sign.detached(this.textEncoder.encode(JSON.stringify([this.sessionId, "remove-peer"])), this.keyPair.secretKey),
            });
        })
        this.subscribe(this.sessionId, "remove-peer", this.removePeer);

        changeNameInput.addEventListener("input", event => {
            changeNameButton.disabled = (changeNameInput.value.length == 0)
        });
        changeNameButton.addEventListener("click", event => {
            const data = {
                name : changeNameInput.value,
            };
            this.publish(this.sessionId, "change-name", {
                data,
                publicKey : this.keyPair.publicKey,
                signature : nacl.sign.detached(this.textEncoder.encode(JSON.stringify([this.sessionId, "change-name", data])), this.keyPair.secretKey),
            });
        });
        this.subscribe(this.sessionId, "change-name", this.changeName);

        this.createQRCode();

        peers.addEventListener("change", event => {
            call.disabled = (peers.value == '');
        });
        call.addEventListener("click", event => {
            const publicKey = new Uint8Array(JSON.parse(peers.value));
            const webcamPublicKey = this.model.webcams[JSON.stringify(Array.from(publicKey))];

            if(webcamPublicKey !== undefined) {
                console.log("connecting to peer");
                this.sendOffer({publicKey}, () => {
                    console.log("connecting to webcam");
                    this.sendOffer({publicKey : webcamPublicKey});
                });
            }
            else {
                this.sendOffer({publicKey});
            }

            const name = this.model.peers[JSON.stringify(publicKey)];
            if(name !== undefined)
                remoteName.innerText = `(${name})`;
        });

        this.subscribe(this.sessionId, "receive-offer", this.receiveOffer);
    }

    get stream() {
        return this.webcam?
            this.streams.webcam.clone() :
            this.streams.local;
    }

    addPeer({publicKey}) {
        if(!nacl.verify(publicKey, this.keyPair.publicKey)) {
            peers.innerHTML += `<option value='${JSON.stringify(Array.from(publicKey))}'>${this.model.peers[JSON.stringify(publicKey)]}</option>`;
        }
    }

    removePeer({publicKey}) {
        if(!nacl.verify(publicKey, this.keyPair.publicKey)) {
            const peer = peers.querySelector(`option[value='${JSON.stringify(Array.from(publicKey))}']`);
            if(peer !== null)
                peers.removeChild(peer);
        }
    }

    changeName({publicKey, name}) {
        if(nacl.verify(publicKey, this.keyPair.publicKey)) {
            if(name !== undefined) {
                changeNameInput.value = '';
                changeNameButton.disabled = true;
                localName.innerText = `(${name})`;
            }
        }
        else {
            peers.querySelector(`option[value='${JSON.stringify(Array.from(publicKey))}']`).innerText = name;
        }
    }

    createQRCode() {
        if(qrCode.children.length == 0) {
            this.qrCode = new QRCode(qrCode, {
                text: `https://10.0.0.104:5500/webcam.html?publicKey=${JSON.stringify(Array.from(this.keyPair.publicKey))}`,
                width: 200,
                height: 200,
            });
        }
    }

    getUserMedia(stream) {
        this.streams.local = stream;
        localVideo.srcObject = stream;
    }
}

class Webcam extends BaseView {
    constructor(model) {
        super(model);
    }

    getUserMedia(stream) {
        this.stream = stream;

        const searchParams = new URLSearchParams(location.search);
        const publicKeyString = searchParams.get("publicKey");

        if(publicKeyString !== null) {
            const publicKey = new Uint8Array(JSON.parse(publicKeyString));
            this.sendOffer({publicKey});
        }
    }
}