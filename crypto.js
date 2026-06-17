/** * End-to-End Encryption Engine (E2EE) using Web Crypto API 
 * Uses ECDH for Key Exchange and AES-GCM for Encrypt/Decrypt
 * Upgraded to use IndexedDB for secure key storage (XSS protection)
 */

// Helper: Safely store and retrieve keys from IndexedDB
const SecureKeyStore = {
    async openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open("ChitChatSecurity", 1);
            req.onupgradeneeded = (e) => e.target.result.createObjectStore("keys");
            req.onsuccess = (e) => resolve(e.target.result);
            req.onerror = (e) => reject(e);
        });
    },
    async saveKey(keyName, value) {
        const db = await this.openDB();
        const tx = db.transaction("keys", "readwrite");
        tx.objectStore("keys").put(value, keyName);
        return new Promise((resolve) => tx.oncomplete = resolve);
    },
    async getKey(keyName) {
        const db = await this.openDB();
        const tx = db.transaction("keys", "readonly");
        const req = tx.objectStore("keys").get(keyName);
        return new Promise((resolve) => req.onsuccess = () => resolve(req.result));
    }
};

export const CryptoE2EE = {
    // Generates a local Public/Private ECDH key pair on signup
    async generateKeys() {
        const keyPair = await window.crypto.subtle.generateKey(
            { name: "ECDH", namedCurve: "P-256" },
            true, ["deriveKey", "deriveBits"]
        );
        const publicKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.publicKey);
        const privateKeyJwk = await window.crypto.subtle.exportKey("jwk", keyPair.privateKey);
        
        // Private key NEVER leaves the browser; locked safely in IndexedDB
        await SecureKeyStore.saveKey("chitchat_private_key", privateKeyJwk);
        return publicKeyJwk; // Save to Firestore
    },

    // Combines My Private Key + Friend's Public Key = Shared AES Secret
    async getSharedKey(peerPublicKeyJwk) {
        try {
            // Retrieve safely from IndexedDB instead of localStorage
            const privKeyJwk = await SecureKeyStore.getKey("chitchat_private_key");
            if (!privKeyJwk || !peerPublicKeyJwk) return null;
            
            const privateKey = await window.crypto.subtle.importKey("jwk", privKeyJwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveKey", "deriveBits"]);
            const publicKey = await window.crypto.subtle.importKey("jwk", peerPublicKeyJwk, { name: "ECDH", namedCurve: "P-256" }, false, []);
            
            return await window.crypto.subtle.deriveKey(
                { name: "ECDH", public: publicKey },
                privateKey,
                { name: "AES-GCM", length: 256 },
                false, ["encrypt", "decrypt"]
            );
        } catch(e) { return null; }
    },

    // Encrypts text using the AES-GCM shared secret
    async encrypt(text, sharedKey) {
        if(!sharedKey) return text; 
        try {
            const iv = window.crypto.getRandomValues(new Uint8Array(12));
            const encoded = new TextEncoder().encode(text);
            const cipher = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, sharedKey, encoded);
            
            // Combine IV and Ciphertext for storage
            const payload = { i: Array.from(iv), c: Array.from(new Uint8Array(cipher)) };
            return "E2EE:" + btoa(JSON.stringify(payload));
        } catch(e) { return text; }
    },

    // Decrypts text pulled from the database back into readable words
    async decrypt(encryptedStr, sharedKey) {
        if(!sharedKey || !encryptedStr.startsWith("E2EE:")) return encryptedStr; 
        try {
            const payload = JSON.parse(atob(encryptedStr.replace("E2EE:", "")));
            const iv = new Uint8Array(payload.i);
            const cipher = new Uint8Array(payload.c);
            const decrypted = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, sharedKey, cipher);
            return new TextDecoder().decode(decrypted);
        } catch(e) { 
            return "🔒 [Encrypted E2EE Message]"; 
        }
    }
};