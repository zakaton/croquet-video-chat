const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

class Model extends Croquet.Model {
    init() {
        this.peers = {}; // {publicKey: name}
        this.webcams = {}; // {publicKey: publicKey}

        this.subscribe(this.sessionId, "add-peer", this.addPeer);
        this.subscribe(this.sessionId, "remove-peer", this.removePeer);

        this.subscribe(this.sessionId, "change-name", this.changeName);

        this.subscribe(this.sessionId, "send-offer", this.sendOffer);
        this.subscribe(this.sessionId, "send-answer", this.sendAnswer);

        this.subscribe(this.sessionId, "add-webcam", this.addWebcam);

        this.unique = 'croquet test 20';
    }

    _verify({scope, event, data, signature, publicKey}) {
        scope = scope || this.sessionId;

        const toBeEncoded = [scope, event];
        if(data !== undefined)
            toBeEncoded.push(data);

        return nacl.sign.detached.verify(textEncoder.encode(JSON.stringify(toBeEncoded)), signature, publicKey);
    }

    addPeer({publicKey}) {
        Object.assign(arguments[0], {
            event : "add-peer",
        });

        if(this._verify(arguments[0])) {
            this.peers[JSON.stringify(publicKey)] = "anonymous";
            this.publish(this.sessionId, "add-peer", {publicKey});
        }
    }
    removePeer({publicKey}) {
        Object.assign(arguments[0], {
            event : "remove-peer",
        });

        if(this._verify(arguments[0])) {
            delete this.peers[JSON.stringify(publicKey)];
            this.publish(this.sessionId, "remove-peer", {publicKey});
        }
    }

    changeName({publicKey, data}) {
        Object.assign(arguments[0], {
            event : "change-name",
        });

        if(this._verify(arguments[0])) {
            const {name} = data;
            if(!Object.values(this.peers).includes(name)) {
                this.peers[JSON.stringify(publicKey)] = name;
                this.publish(this.sessionId, "change-name", {publicKey, name});
            }
        }
    }

    sendOffer({publicKey, data}) {
        Object.assign(arguments[0], {
            event : "send-offer",
        });

        if(this._verify(arguments[0])) {
            this.publish(this.sessionId, "receive-offer", {publicKey, data});
        }
    }
    sendAnswer({publicKey, data}) {
        Object.assign(arguments[0], {
            event : "send-answer",
        });

        if(this._verify(arguments[0])) {
            this.publish(this.sessionId, "receive-answer", {publicKey, data});
        }
    }

    addWebcam({publicKey, data}) {
        Object.assign(arguments[0], {
            event : "add-webcam",
        });

        if(this._verify(arguments[0])) {
            this.webcams[JSON.stringify(Array.from(publicKey))] = data.publicKey;
        }
    }
}

Model.register();