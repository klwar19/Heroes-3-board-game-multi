import type { BuildingLibrary } from "@/engine/state";

const prototypeCredit =
  "Prototype data for the online rules engine. Replace with verified official component text before full content import.";

export const sampleBuildings: BuildingLibrary = {
  village_hall: {
    id: "village_hall",
    name: "Village Hall",
    cost: {},
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: prototypeCredit
    }
  },
  marketplace: {
    id: "marketplace",
    name: "Marketplace",
    cost: {
      gold: 2,
      buildingMaterials: 1
    },
    prerequisites: ["village_hall"],
    effect: {
      type: "GAIN_RESOURCE",
      resource: "valuables",
      amount: 1
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: prototypeCredit
    }
  },
  training_grounds: {
    id: "training_grounds",
    name: "Training Grounds",
    cost: {
      gold: 3,
      buildingMaterials: 2
    },
    prerequisites: ["village_hall"],
    effect: {
      type: "ADD_EXPERT_USE_LIMIT",
      amount: 1
    },
    implementationStatus: "implemented",
    source: {
      product: "Heroes of Might and Magic III: The Board Game",
      credit: prototypeCredit
    }
  }
};
