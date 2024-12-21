const Joi = require('joi');
const { merge } = require('lodash');

const EventsNode = require('./EventsNode');
const { INTEGRATION_UNLOADED, INTEGRATION_NOT_LOADED } = require('../const');
const { STATUS_SHAPE_DOT, STATUS_SHAPE_RING } = require('../helpers/status');

const DEFAULT_NODE_OPTIONS = {
    debug: false,
    config: {
        haConfig: {},
        exposeToHomeAssistant: (nodeDef) =>
            nodeDef.exposeToHomeAssistant === undefined
                ? false
                : nodeDef.exposeToHomeAssistant,
    },
};

class EventsHaNode extends EventsNode {
    constructor({ node, config, RED, status, nodeOptions = {} }) {
        nodeOptions = merge({}, DEFAULT_NODE_OPTIONS, nodeOptions);
        super({ node, config, RED, status, nodeOptions });

        // Check if there's a server selected
        if (this.nodeConfig.server) {
            // Determine if node needs to be removed from Home Assistant because it's no longer exposed
            this.removeFromHA = !!(
                this.nodeConfig.exposeToHomeAssistant === false &&
                this.server.exposedNodes[this.id] === true
            );
            // Save expose state so we can check if it needs to removed when it's not exposed anymore
            this.server.exposedNodes[this.node.id] =
                this.nodeConfig.exposeToHomeAssistant;
        }
        this.init();
    }

    get lastPayload() {
        return this.state.getLastPayload();
    }

    set lastPayload(payload) {
        this.state.setLastPayload(payload);
    }

    async init() {
        if (this.isIntegrationLoaded) {
            this.registerEntity();
            this.removeFromHomeAssistant();
        }
    }

    async onClose(removed) {
        super.onClose(removed);

        if (removed) {
            if (
                this.isIntegrationLoaded &&
                this.nodeConfig.exposeToHomeAssistant
            ) {
                this.removeFromHomeAssistant(true);
            }
        }

        this.removeSubscription();
    }

    onHaEventsOpen() {
        this.subscription = null;
    }

    onHaIntegration(type) {
        super.onHaIntegration(type);

        switch (type) {
            case INTEGRATION_UNLOADED:
            case INTEGRATION_NOT_LOADED:
                this.removeSubscription();
                if (this.node.type !== 'trigger-state') {
                    this.isEnabled = true;
                }
                break;
        }
    }

    getDiscoveryPayload(config) {
        return {
            type: 'nodered/discovery',
            server_id: this.nodeConfig.server.id,
            node_id: this.node.id,
            component: 'switch',
            state: this.isEnabled,
            config,
        };
    }

    async registerEntity(status = true) {
        if (super.registerEntity() === false) {
            return;
        }

        const haConfig = {};
        // Handle both event node and sensor node switch HA config
        const config = this.nodeConfig.haConfig || this.nodeConfig.config;
        config
            .filter((c) => c.value.length)
            .forEach((e) => (haConfig[e.property] = e.value));

        try {
            const payload = this.getDiscoveryPayload(haConfig);
            this.node.debug(`Registering with Home Assistant`);
            this.subscription = await this.homeAssistant.subscribeMessage(
                this.onHaEventMessage.bind(this),
                payload,
                { resubscribe: false },
            );
        } catch (e) {
            this.status.setFailed(this.RED._('config-server.status.error'));
            this.node.error(e.message);
            return;
        }

        if (status) {
            this.status.setSuccess(
                this.RED._('config-server.status.registered'),
            );
        }
        this.registered = true;
    }

    onHaEventMessage(evt) {
        if (evt.type === undefined) {
            // Need to set type prior to 0.20.0
            evt.type = 'state_changed';
        }
        if (evt.type) {
            switch (evt.type) {
                case 'state_changed':
                    this.isEnabled = evt.state;
                    this.updateHomeAssistant();
                    break;
                case 'automation_triggered':
                    this.handleTriggerMessage(evt.data);
                    break;
            }
        }
    }

    // Find the number of outputs by looking at the number of wires
    get #numberOfOutputs(): number {
        if ('wires' in this && Array.isArray(this.wires)) {
            return this.wires.length;
        }

        return 0;
    }

    async handleTriggerMessage(data = {}) {
        if (!this.isEnabled) return;

        const schema = Joi.object({
            entity_id: Joi.string().allow(null),
            skip_condition: Joi.boolean().default(false),
            output_path: Joi.string().default('0'),
        });
        let validatedData, entity, entityId;

        try {
            validatedData = await schema.validateAsync(data);

            entityId = validatedData.entity_id || this.getNodeEntityId();

            if (!entityId) {
                throw new Error(
                    'Entity filter type is not set to exact and no entity_id found in trigger data.',
                );
            }

            entity = this.homeAssistant.getStates(entityId);

            if (!entity) {
                throw new Error(
                    `entity_id provided by trigger event not found in cache: ${entityId}`,
                );
            }
        } catch (e) {
            this.status.setFailed('Error');
            this.node.error(`Trigger Error: ${e.message}`, {});
            return;
        }

        const eventMessage = {
            event_type: 'triggered',
            entity_id: entity.entity_id,
            event: {
                entity_id: entity.entity_id,
                old_state: entity,
                new_state: entity,
            },
        };

        if (!validatedData.skip_condition) {
            this.triggerNode(eventMessage);
            return;
        }

        const outputCount = this.#numberOfOutputs;

        // If there are no outputs, there is nothing to do
        if (outputCount === 0) return;

        // Remove any paths that are greater than the number of outputs
        const paths = validatedData.output_path
            .split(',')
            .map((path) => Number(path))
            .filter((path) => path <= outputCount);

        // If there are no paths, there is nothing to do
        if (paths.length === 0) return;

        const msg = {
            topic: entityId,
            payload: eventMessage.event.new_state.state,
            data: eventMessage.event,
        };

        // If there is only one path and it is 0 or 1, return the payload as is
        let payload;
        if (paths.length === 1 && paths.includes(1)) {
            payload = msg;
        } else if (paths.includes(0)) {
            // create an array the size of the number of outputs and fill it with the payload
            payload = new Array(outputCount).fill([msg]);
        } else {
            // create an array and fill it with the message only if index exists in paths
            payload = new Array(outputCount)
                .fill(0)
                .map((_, index) =>
                    paths.includes(index + 1) ? msg : null,
                );
        }

        this.status.set({
            shape: paths.includes(1) ? STATUS_SHAPE_DOT : STATUS_SHAPE_RING,
            text: this.status.appendDateString(
                eventMessage.event.new_state.state,
            ),
        });
        this.send(payload);
    }

    getNodeEntityId() {}

    triggerNode() {}

    updateHomeAssistant() {
        if (!this.isIntegrationLoaded) return;

        const message = {
            type: 'nodered/entity',
            server_id: this.nodeConfig.server.id,
            node_id: this.node.id,
            state: this.isEnabled,
        };

        this.homeAssistant.send(message);
    }

    // Remove from Home Assistant when `Expose to Home Assistant` is unchecked
    removeFromHomeAssistant(nodeRemoved = false) {
        if (
            !this.homeAssistant.isIntegrationLoaded ||
            (!this.removeFromHA && !nodeRemoved) ||
            (this.nodeConfig.entityType &&
                this.nodeConfig.entityType !== 'switch')
        ) {
            return;
        }

        const payload = { ...this.getDiscoveryPayload(), remove: true };

        this.homeAssistant.send(payload);
        this.removeFromHA = false;
        this.removeSubscription();

        // Enabled node when removing it from Home Assistant as there is no
        // way to do so once it's removed except for the trigger-state node
        this.isEnabled = true;
    }

    async removeSubscription() {
        if (this.subscription) {
            this.node.debug('Unregistering from HA');
            await this.subscription().catch(() => {});
        }
        this.subscription = null;
    }
}

module.exports = EventsHaNode;
