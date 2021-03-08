/* global jQuery: false */
// eslint-disable-next-line no-unused-vars
const haOutputs = (function ($) {
    const customOutputElement = '#custom-outputs';
    let $outputs;

    const customTypes = {
        entity: { value: 'entity', label: 'entity', hasValue: false },
        entityId: { value: 'entityId', label: 'entity id', hasValue: false },
        event: { value: 'event', label: 'event', hasValue: false },
        prevEntity: {
            value: 'prevEntity',
            label: 'previous entity',
            hasValue: false,
        },
        results: { value: 'results', label: 'results', hasValue: false },
        sentData: { value: 'sentData', label: 'sent data', hasValue: false },
        state: { value: 'state', label: 'state', hasValue: false },
        timeSinceChangedMs: {
            value: 'timeSinceChangedMs',
            label: 'timeSinceChangedMs',
            hasValue: false,
        },
    };
    const defaultTypes = [
        'flow',
        'global',
        'str',
        'num',
        'bool',
        'date',
        'jsonata',
    ];

    function createOutputs(
        properties,
        { element = customOutputElement, extraTypes = [] } = {}
    ) {
        $outputs = $(element);

        $outputs.editableList({
            addButton: true,
            removable: true,
            sortable: true,
            height: 'auto',
            header: $('<div>').append('Outputs'),
            addItem: function (container, _, data) {
                container.css({
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                });
                const $row = $('<div />').appendTo(container);
                const propertyName = $('<input/>', {
                    class: 'property-name',
                    type: 'text',
                })
                    .css('width', '30%')
                    .appendTo($row)
                    .typedInput({ types: ['msg', 'flow', 'global'] });

                $('<div/>', { style: 'display:inline-block; padding:0px 6px;' })
                    .text('=')
                    .appendTo($row);

                const propertyValue = $('<input/>', {
                    class: 'property-value',
                    type: 'text',
                })
                    .css('width', 'calc(70% - 30px)')
                    .appendTo($row)
                    .typedInput({
                        default: 'str',
                        types: getTypes(extraTypes),
                    });

                propertyName.typedInput('value', data.property);
                propertyName.typedInput('type', data.propertyType);

                propertyValue.typedInput('value', data.value);
                propertyValue.typedInput('type', data.valueType);
            },
        });
        $outputs.editableList('addItems', properties);
    }

    function getTypes(extraTypes = []) {
        let valueTypes = extraTypes.reduce((acc, type) => {
            if (type in customTypes) return [...acc, customTypes[type]];

            return acc;
        }, []);

        if (extraTypes.includes('msg')) {
            valueTypes.push('msg');
        }
        valueTypes = [...valueTypes, ...defaultTypes];

        return valueTypes;
    }

    function getOutputs() {
        const outputList = $(customOutputElement).editableList('items');
        const outputs = [];
        outputList.each(function () {
            const $property = $(this).find('.property-name');
            const $value = $(this).find('.property-value');
            const property = $property.typedInput('value');
            const propertyType = $property.typedInput('type');
            const value = $value.typedInput('value');
            const valueType = $value.typedInput('type');
            outputs.push({
                property,
                propertyType,
                value,
                valueType,
            });
        });

        return outputs;
    }

    function validate(value) {
        return !value.some((output) => output.property.length === 0);
    }

    return {
        createOutputs,
        getOutputs,
        validate,
    };
})(jQuery);