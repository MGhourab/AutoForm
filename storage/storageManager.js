class StorageManager {
    static async get(keys) {
        return new Promise(resolve => {
            chrome.storage.local.get(keys, result => resolve(result));
        });
    }

    static async set(data) {
        return new Promise(resolve => {
            chrome.storage.local.set(data, () => resolve());
        });
    }

    static async remove(keys) {
        return new Promise(resolve => {
            chrome.storage.local.remove(keys, () => resolve());
        });
    }

    static async clear() {
        return new Promise(resolve => {
            chrome.storage.local.clear(() => resolve());
        });
    }

    static async getConfiguration() {
        const data = await this.get([
            "selectors",
            "fields",
            "submitButton"
        ]);

        return {
            selectors: data.selectors || {},
            fields: data.fields || [],
            submitButton: data.submitButton || null
        };
    }

    static async saveConfiguration(configuration) {
        await this.set({
            selectors: configuration.selectors || {},
            fields: configuration.fields || [],
            submitButton: configuration.submitButton || null
        });
    }

    static async isConfigured() {
        const config = await this.getConfiguration();

        return (
            config.fields.length > 0 &&
            config.submitButton !== null
        );
    }
}

window.StorageManager = StorageManager;