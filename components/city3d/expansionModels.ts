import * as THREE from 'three';
import type { ModelContext } from './models';
import type { BuildingType } from '../../services/cityGameService';
import { BuildingKit } from './buildingKit';
import { ruralBuildings } from './ruralBuildings';
import { urbanBuildings } from './urbanBuildings';
import { publicBuildings } from './publicBuildings';
import { infrastructureBuildings } from './infrastructureBuildings';

export const BUILDING_RECIPES = { ...ruralBuildings, ...urbanBuildings, ...publicBuildings, ...infrastructureBuildings };

export function buildExpansionModel(type: BuildingType, context: ModelContext, level: number): THREE.Group {
  const recipe = BUILDING_RECIPES[type.id];
  if (!recipe) throw new Error(`Missing architectural model for ${type.id}`);
  const kit = new BuildingKit(context, level);
  recipe(kit);
  // Details use normalized plot coordinates; existing save footprints remain unchanged.
  kit.group.scale.set(type.size, type.size, type.size);
  kit.group.name = type.id;
  return kit.group;
}
