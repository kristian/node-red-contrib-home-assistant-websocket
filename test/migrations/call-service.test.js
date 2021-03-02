const { expect } = require('chai');

const migrations = require('../../src/migrations/call-service');
const { migrate } = require('../../src/migrations');

const VERSION_UNDEFINED = {
    type: 'api-call-service',
    name: 'label of node',
    server: 'random.server.id',
    service_domain: 'service_domain',
    service: 'service_action',
    data: JSON.stringify({
        entity_id: 'entity.id1, entity.id2',
        message: 'extra_data',
    }),
    dataType: 'json',
    mergecontext: 'flowvalue',
    output_location: 'payload',
    output_location_type: 'msg',
    mustacheAltTags: false,
};
const VERSION_0 = {
    ...VERSION_UNDEFINED,
    version: 0,
};
const VERSION_1_SCHEMA = {
    ...VERSION_0,
    version: 1,
    entityId: 'entity.id1, entity.id2',
    data: JSON.stringify({
        message: 'extra_data',
    }),
};

describe('Migrations - Call Service Node', function () {
    describe('Version 0', function () {
        it('should add version 0 to schema when no version is defined', function () {
            const migrate = migrations.find((m) => m.version === 0);
            const migratedSchema = migrate.up(VERSION_UNDEFINED);

            expect(migratedSchema).to.eql(VERSION_0);
        });
    });
    describe('Version 1', function () {
        it('should update version 0 to version 1', function () {
            const migrate = migrations.find((m) => m.version === 1);
            const migratedSchema = migrate.up(VERSION_0);

            expect(migratedSchema).to.eql(VERSION_1_SCHEMA);
        });

        it('extract entity_id out of data and move it to entityId', function () {
            const schema = {
                ...VERSION_0,
                data: JSON.stringify({ entity_id: 'hello' }),
            };
            const expectedSchema = {
                ...VERSION_1_SCHEMA,
                entityId: 'hello',
                data: '',
            };
            const migrate = migrations.find((m) => m.version === 1);
            const migratedSchema = migrate.up(schema);

            expect(migratedSchema).to.eql(expectedSchema);
        });
        it('extract entity_id out of data and move it to entityId with data only containing left over properties', function () {
            const schema = {
                ...VERSION_0,
                data: JSON.stringify({
                    entity_id: 'hello',
                    brightness: 100,
                    text: 'string',
                }),
            };
            const expectedSchema = {
                ...VERSION_1_SCHEMA,
                entityId: 'hello',
                data: JSON.stringify({ brightness: 100, text: 'string' }),
            };
            const migrate = migrations.find((m) => m.version === 1);
            const migratedSchema = migrate.up(schema);

            expect(migratedSchema).to.eql(expectedSchema);
        });
        it(`set entityId to empty string when entity_id doesn't exists in data`, function () {
            const schema = {
                ...VERSION_0,
                data: JSON.stringify({
                    brightness: 100,
                    text: 'string',
                }),
            };
            const expectedSchema = {
                ...VERSION_1_SCHEMA,
                entityId: '',
                data: JSON.stringify({ brightness: 100, text: 'string' }),
            };
            const migrate = migrations.find((m) => m.version === 1);
            const migratedSchema = migrate.up(schema);

            expect(migratedSchema).to.eql(expectedSchema);
        });
    });
    it('should update an undefined version to current version', function () {
        const migratedSchema = migrate(VERSION_UNDEFINED);
        expect(migratedSchema).to.eql(VERSION_1_SCHEMA);
    });
});