import { textWidth } from "../../helper/dom";
import { isDefined, isNull } from "../../helper/utils";
import TranslationService from "services/TranslationService";

const clone = require("lodash/clone");
const NotificationService = require("services/NotificationService");

Vue.component("variation-select", {

    props: {
        template:
        {
            type: String,
            default: "#vue-variation-select"
        }
    },

    data()
    {
        return {
            filteredVariationsCache: {}
        };
    },

    computed:
    {
        /**
         * returns true if any variation has no attributes
         */
        hasEmptyOption()
        {
            return this.variations.some(variation => !variation.attributes.length);
        },

        /**
         * returns the variation, based on the selected attributes / unit
         * returns false if there are none or multiple results
         */
        currentSelection()
        {
            const filteredVariations = this.filterVariations(null, null, true);

            if (filteredVariations.length === 1)
            {
                return filteredVariations[0];
            }

            return false;
        },

        ...Vuex.mapState({
            attributes: state => state.variationSelect.attributes,
            currentVariation: state => state.item.variation.documents[0].data,
            selectedAttributes: state => state.variationSelect.selectedAttributes,
            selectedUnit: state => state.variationSelect.selectedUnit,
            units: state => state.variationSelect.units,
            variations: state => state.variationSelect.variations
        })
    },

    methods:
    {
        /**
         * select an attribute and check, if the selection is valid; if not, unsetInvalidSelection will be executed
         * @param {number} attributeId
         * @param {[number, string, null]} attributeValueId
         */
        selectAttribute(attributeId, attributeValueId)
        {
            attributeValueId = parseInt(attributeValueId) || null;

            if (this.selectedAttributes[attributeId] !== attributeValueId)
            {
                this.$store.commit("selectItemAttribute", { attributeId, attributeValueId });
                this.onSelectionChange(attributeId, attributeValueId, null);
            }
        },

        /**
         * select a unit and check, if the selection is valid; if not, unsetInvalidSelection will be executed
         * @param {[number, string]} unitId
         */
        selectUnit(unitId)
        {
            unitId = parseInt(unitId);
            this.$store.commit("selectItemUnit", unitId);
            this.onSelectionChange(null, null, unitId);
        },

        onSelectionChange(attributeId, attributeValueId, unitId)
        {
            if (this.currentSelection)
            {
                this.setVariation(this.currentSelection.variationId);
            }
            else
            {
                this.unsetInvalidSelection(attributeId, attributeValueId, unitId);
            }
        },

        /**
         * changes the selected attributes / unit, to ensure a valid seelction
         * @param {[number, null]} attributeId
         * @param {[number, null]} attributeValueId
         * @param {[number, null]} unitId
         */
        unsetInvalidSelection(attributeId, attributeValueId, unitId)
        {
            const qualifiedVariations = this.getQualifiedVariations(attributeId, attributeValueId, unitId);
            const closestVariation    = this.getClosestVariation(qualifiedVariations);

            if (!closestVariation)
            {
                return;
            }

            const invalidSelection = this.getInvalidSelectionByVariation(closestVariation);

            this.correctSelection(invalidSelection);
        },


        /**
         * returns a list of variations, filtered by attribute or unit
         * @param {[number, null]} attributeId
         * @param {[number, null]} attributeValueId
         * @param {[number, null]} unitId
         */
        getQualifiedVariations(attributeId, attributeValueId, unitId)
        {
            if (isDefined(attributeValueId))
            {
                return this.variations.filter(variation =>
                {
                    return isDefined(variation.attributes.find(attribute =>
                        attribute.attributeId === attributeId && attribute.attributeValueId === attributeValueId));
                });
            }
            else if (isDefined(unitId))
            {
                return this.variations.filter(variation => variation.unitCombinationId === unitId);
            }

            return this.variations.filter(variation => !variation.attributes.length);
        },

        /**
         * returns a variation, where a minimum of changes in the selection is required to archive
         * @param {array} qualifiedVariations
         */
        getClosestVariation(qualifiedVariations)
        {
            let closestVariation;
            let numberOfRequiredChanges;

            for (const variation of qualifiedVariations)
            {
                let changes = 0;

                if (variation.unitCombinationId !== this.selectedUnit && !isNull(this.selectedUnit))
                {
                    changes++;
                }

                for (const attribute of variation.attributes)
                {
                    if (this.selectedAttributes[attribute.attributeId] !== attribute.attributeValueId)
                    {
                        changes++;
                    }
                }

                if (!numberOfRequiredChanges || changes < numberOfRequiredChanges)
                {
                    closestVariation = variation;
                    numberOfRequiredChanges = changes;
                }
            }

            return closestVariation;
        },

        /**
         * returns object with array 'attributesToReset' and newUnit. The attributesToReset contains all attributes, which are not matching with the given variation
         * @param {object} variation
         */
        getInvalidSelectionByVariation(variation)
        {
            const attributesToReset = [];
            let newUnit = null;

            for (let selectedAttributeId in this.selectedAttributes)
            {
                selectedAttributeId = parseInt(selectedAttributeId);
                const variationAttribute = variation.attributes.find(attribute => attribute.attributeId === selectedAttributeId);

                if (!isNull(this.selectedAttributes[selectedAttributeId]))
                {
                    if (variationAttribute && variationAttribute.attributeValueId !== this.selectedAttributes[selectedAttributeId] || !variationAttribute)
                    {
                        const attributeToReset = this.attributes.find(attr => attr.attributeId === selectedAttributeId);

                        attributesToReset.push(attributeToReset);
                    }
                }
            }

            if (variation.unitCombinationId !== this.selectedUnit)
            {
                newUnit = variation.unitCombinationId;
            }

            return { attributesToReset, newUnit };
        },

        /**
         * resets all invalid attributes and change the unit, if required. Prints a message to the user if so.
         * @param {object} invalidSelection
         */
        correctSelection(invalidSelection)
        {
            const messages   = [];
            const attributes = clone(this.selectedAttributes);

            for (const attributeToReset of invalidSelection.attributesToReset)
            {
                messages.push(
                    TranslationService.translate("Ceres::Template.singleItemNotAvailable", { name: attributeToReset.name })
                );

                attributes[attributeToReset.attributeId] = null;
            }

            if (invalidSelection.newUnit)
            {
                if (!isNull(this.selectedUnit))
                {
                    messages.push(
                        TranslationService.translate("Ceres::Template.singleItemNotAvailable", { name:
                            TranslationService.translate("Ceres::Template.singleItemContent")
                        })
                    );
                }

                this.$store.commit("selectItemUnit", invalidSelection.newUnit);
            }

            this.$store.commit("setItemSelectedAttributes", attributes);

            if (this.currentSelection)
            {
                this.setVariation(this.currentSelection.variationId);
            }

            NotificationService.warn(
                messages.join("<br>")
            ).closeAfter(5000);
        },

        /**
         * returns matching variations with current selection
         * attributes and unitId could be filled, to check a specific selection
         * @param {object} attributes
         * @param {number} unitId
         * @param {boolean} strict
         */
        filterVariations(attributes, unitId, strict)
        {
            attributes = attributes || this.selectedAttributes;
            unitId = unitId || this.selectedUnit;
            strict = !!strict;

            const key = `${JSON.stringify(attributes)}_${unitId}_${strict}`;

            if (isDefined(this.filteredVariationsCache[key]))
            {
                return this.filteredVariationsCache[key];
            }

            const uniqueValues = [...new Set(Object.values(attributes))];
            const isEmptyOptionSelected = uniqueValues.length === 1 && isNull(uniqueValues[0]);

            // eslint-disable-next-line complexity
            const filteredVariations = this.variations.filter(variation =>
            {
                // the selected unit is not matching
                if (variation.unitCombinationId !== unitId)
                {
                    return false;
                }

                // the variation has no attributes (only checked, if any attribute has a selected value); or the variation has attributes and empty option is selected
                // requires more than 0 attributes
                if (((!isEmptyOptionSelected && !variation.attributes.length) || (isEmptyOptionSelected && variation.attributes.length))
                    && this.attributes.length > 0)
                {
                    return false;
                }

                for (const attributeId in attributes)
                {
                    const variationAttribute = variation.attributes.find(variationAttribute =>
                        variationAttribute.attributeId === parseInt(attributeId));

                    // an attribute is not matching with selection
                    if (variationAttribute &&
                        variationAttribute.attributeValueId !== attributes[attributeId] &&
                        (strict || !strict && !isNull(attributes[attributeId])))
                    {
                        return false;
                    }
                }

                return true;
            });

            this.filteredVariationsCache[key] = filteredVariations;

            return filteredVariations;
        },

        /**
         * returns true, if the selection with a new attribute value would be valid
         * @param {number} attributeId
         * @param {[number, string, null]} attributeValueId
         */
        isAttributeSelectionValid(attributeId, attributeValueId)
        {
            const selectedAttributes = clone(this.selectedAttributes);

            selectedAttributes[attributeId] = parseInt(attributeValueId) || null;

            return this.selectedAttributes[attributeId] === attributeValueId || !!this.filterVariations(selectedAttributes).length;
        },

        /**
         * returns true, if the selection with a new unitId would be valid
         * @param {[number, string]} unitId
         */
        isUnitSelectionValid(unitId)
        {
            unitId = parseInt(unitId);

            return this.selectedUnit === unitId || !!this.filterVariations(null, unitId).length;
        },

        // eslint-disable-next-line complexity
        getAttributeValueLabel(attributeId, attributeValueId)
        {
            attributeValueId = parseInt(attributeValueId) || null;
            const attributeName = this.getAttributeName(attributeId, attributeValueId);

            if (this.selectedAttributes[attributeId] === attributeValueId)
            {
                return attributeName;
            }

            const selectedAttributes = clone(this.selectedAttributes);

            selectedAttributes[attributeId] = parseInt(attributeValueId) || null;

            return this.getTranslatedLabel(selectedAttributes, attributeId, attributeValueId, this.selectedUnit, attributeName);
        },

        getAttributeName(attributeId, attributeValueId)
        {
            const attribute = this.attributes.find(attribute => attribute.attributeId === attributeId);

            if (isDefined(attribute) && isDefined(attribute.values))
            {
                const attributeValue = attribute.values.find(value => value.attributeValueId === attributeValueId);

                if (isDefined(attributeValue))
                {
                    return attributeValue.name;
                }
            }

            return null;
        },

        getUnitLabel(unitId)
        {
            unitId = parseInt(unitId);

            const unitName = this.units[unitId];

            if (this.selectedUnit === unitId)
            {
                return unitName;
            }

            return this.getTranslatedLabel(this.selectedAttributes, null, null, unitId, unitName);
        },

        getTranslatedLabel(attributes, attributeId, attributeValueId, unitId, name)
        {
            const filteredVariations = this.filterVariations(attributes, unitId);

            if (filteredVariations.length === 0)
            {
                return this.getInvalidOptionTooltip(attributeId, attributeValueId, unitId, name);
            }
            if (filteredVariations.length === 1 && !filteredVariations[0].isSalable)
            {
                return TranslationService.translate("Ceres::Template.singleItemSoldOut", { name });
            }

            return name;
        },

        // eslint-disable-next-line complexity
        getInvalidOptionTooltip(attributeId, attributeValueId, unitId, name)
        {
            const qualifiedVariations = this.getQualifiedVariations(attributeId, attributeValueId, unitId);
            const closestVariation    = this.getClosestVariation(qualifiedVariations);

            if (closestVariation)
            {
                const invalidSelection = this.getInvalidSelectionByVariation(closestVariation);
                const names = [];

                for (const attribute of invalidSelection.attributesToReset)
                {
                    if (attribute.attributeId !== attributeId)
                    {
                        names.push(`<b>${attribute.name}</b>`);
                    }
                }
                if (invalidSelection.newUnit)
                {
                    names.push(
                        `<b>${TranslationService.translate("Ceres::Template.singleItemContent")}</b>`
                    );
                }

                return TranslationService.translate(
                    `Ceres::Template.singleItemNotAvailableInSelection${ isDefined(name) ? "WithAttributeName" : "" }`,
                    { name: names.join(", "), attribute: name });
            }

            return null;
        },

        /**
         * dispatch vuex action 'loadVariation' to archive a variation
         * dispatches a custom event named 'onVariationChanged'
         * @param {[string, number, null]} variationId
         */
        setVariation(variationId)
        {
            if (!isDefined(variationId) && this.currentSelection)
            {
                variationId = this.currentSelection.variationId;
            }

            if (isDefined(variationId))
            {
                this.$store.dispatch("loadVariation", variationId).then(variation =>
                {
                    document.dispatchEvent(new CustomEvent("onVariationChanged",
                        {
                            detail:
                            {
                                attributes: variation.attributes,
                                documents: variation.documents
                            }
                        }));
                });
            }
        },

        isTextCut(content)
        {
            if (this.$refs.attributesContaner)
            {
                return textWidth(content, "Custom-Font, Helvetica, Arial, sans-serif") > this.$refs.attributesContaner[0].clientWidth;
            }

            return false;
        },

        getSelectedAttributeValueName(attribute)
        {
            const selectedAttributeValueId =  this.selectedAttributes[attribute.attributeId];
            const selectedAttributeValue = attribute.values.find(attrValue => attrValue.attributeValueId === selectedAttributeValueId);

            return selectedAttributeValue ? selectedAttributeValue.name : TranslationService.translate("Ceres::Template.singleItemPleaseSelect");
        }
    },

    watch:
    {
        currentSelection(value)
        {
            this.$store.commit("setIsVariationSelected", !!value);
        }
    }
});
