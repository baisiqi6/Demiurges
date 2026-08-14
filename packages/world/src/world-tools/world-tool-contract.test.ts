import { describe, expect, test } from "bun:test";

import { isDeepFrozen } from "../kernel/world";
import {
  ACTUATOR_SEQUENCE_GOLDEN_DIGEST,
  FREE_FALL_GOLDEN_DIGEST,
  WORLD_FIXTURE_IDS,
  WORLD_TOOL_CONTRACT,
  requireWorldEditInput,
  requireWorldRunInput,
  requireWorldWriteInput,
} from "./world-tool-contract";

const expected = { name:"world:current", snapshotId:"snapshot:base", version:1 } as const;

describe("WORLD_TOOL_CONTRACT DH-011", () => {
  test("single frozen source exposes four fixtures and per-tool budgets", () => {
    expect(isDeepFrozen(WORLD_TOOL_CONTRACT)).toBe(true);
    expect(WORLD_FIXTURE_IDS).toEqual([
      "fixture:primitive-box","fixture:diagnostic-wedge-v1","fixture:ball-vessel-v1","fixture:two-joint-planar-reach-v1","fixture:marble-hunyuan-composite-v1",
    ]);
    expect(WORLD_TOOL_CONTRACT.read.inputBudget.maxNodes).toBe(128);
    expect(WORLD_TOOL_CONTRACT.run.inputBudget).toEqual({maxNodes:256,maxDepth:8,maxStringLength:512});
  });

  test("write/edit accept exact discriminated plain data", () => {
    expect(requireWorldWriteInput({fixtureId:"fixture:two-joint-planar-reach-v1"}).fixtureId).toBe("fixture:two-joint-planar-reach-v1");
    const edit=requireWorldEditInput({expected,targetRef:"entity:cube",change:{kind:"pose",frameRef:"frame:world",pose:{position:{x:0,y:0,z:2.8},rotation:{x:0,y:0,z:0,w:1}}}});
    expect(edit.change.kind).toBe("pose");
    const generated=requireWorldEditInput({expected,targetRef:"entity:generated-object",change:{kind:"pose",frameRef:"frame:world",pose:{position:{x:0,y:0,z:1.2},rotation:{x:0,y:0,z:0,w:1}}}});
    expect(generated.targetRef).toBe("entity:generated-object");
    expect(()=>requireWorldEditInput({expected,targetRef:"entity:cube",frameRef:"frame:world",pose:{}})).toThrow("字段");
  });

  test("explicit free-fall and actuator Programs derive canonical identity", () => {
    const falling=requireWorldRunInput({runId:"run:fall",program:{kind:"free-fall",targetRef:"entity:cube",durationSeconds:2.5,sampleRateHz:30}});
    expect(falling.program.id).toBe(`program:sha256:${FREE_FALL_GOLDEN_DIGEST}`);
    const reach=requireWorldRunInput({runId:"run:reach",program:{kind:"actuator-sequence",targetRef:"entity:arm",durationSeconds:3,sampleRateHz:30,steps:[{timeSeconds:0,commands:[{actuatorRef:"actuator:arm-shoulder-position",valueRadians:.35},{actuatorRef:"actuator:arm-elbow-position",valueRadians:-.35}]},{timeSeconds:.5,commands:[{actuatorRef:"actuator:arm-shoulder-position",valueRadians:.65},{actuatorRef:"actuator:arm-elbow-position",valueRadians:-1}]}]}});
    expect(reach.program.id).toBe(`program:sha256:${ACTUATOR_SEQUENCE_GOLDEN_DIGEST}`);
    expect(()=>requireWorldRunInput({runId:"run:legacy",programId:"program:free-fall-rigid-v1"})).toThrow("字段");
  });

  test("nested arrays reject accessors, extra keys and symbols without reading getters", () => {
    const step = {timeSeconds:0,commands:[
      {actuatorRef:"actuator:arm-shoulder-position",valueRadians:.35},
      {actuatorRef:"actuator:arm-elbow-position",valueRadians:-.35},
    ]};
    const input = (steps: unknown) => ({runId:"run:array",program:{kind:"actuator-sequence",targetRef:"entity:arm",durationSeconds:3,sampleRateHz:30,steps}});
    let getterReads=0;
    const accessor=[step];
    Object.defineProperty(accessor,"0",{enumerable:true,get(){getterReads+=1;return step;}});
    expect(()=>requireWorldRunInput(input(accessor))).toThrow("enumerable own data");
    expect(getterReads).toBe(0);
    const extra=[step] as unknown[] & {extra?:number}; extra.extra=1;
    expect(()=>requireWorldRunInput(input(extra))).toThrow("dense index");
    const symbolic=[step] as unknown[] & Record<symbol,number>; symbolic[Symbol("forged")]=1;
    expect(()=>requireWorldRunInput(input(symbolic))).toThrow("dense index");
  });
});
