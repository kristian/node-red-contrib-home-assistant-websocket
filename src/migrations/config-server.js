const migrations = [
    {
        version: 0,
        up: (schema) => {
            const newSchema = {
                ...schema,
                version: 0,
            };
            return newSchema;
        },
    },
    {
        version: 1,
        up: (schema) => {
            const newSchema = {
                ...schema,
                version: 1,
                ha_boolean: schema.ha_boolean || 'y|yes|true|on|home|open',
                rejectUnauthorizedCerts: schema.rejectUnauthorizedCerts || true,
                connectionDelay: schema.connectionDelay || true,
                cacheJson: schema.cacheJson || true,
            };
            return newSchema;
        },
    },
];

module.exports = migrations;
