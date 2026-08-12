import { describe, expect, test } from "bun:test";

import { evaluateEpisode } from "../evaluation/evaluate-episode";
import { RuntimeMvpHost } from "../host/runtime-mvp-host";
import { ADOPT_RUNTIME_MVP_POLICY } from "../host/runtime-mvp-adopt-policy";
import type { EvaluationRecord } from "../kernel/types";
import {
  createInitialSnapshot,
  deepFreeze,
  FALLING_CUBE_PROGRAM,
  LANDING_SUCCESS_CONTRACT,
  MUJOCO_PROFILE,
} from "../kernel/world";
import { runFallingCube } from "../runtime-mujoco/run-falling-cube";
import { createWorldRepositoryAuthority } from "./world-repository";

const createRepository = () => {
  const authority = createWorldRepositoryAuthority();
  return { ...authority.repository, ...authority.evidence };
};

describe("WorldRepository ref authority", () => {
  test("Repository evidence authority 只作为 lexical closure 交给 Host，不导出可拦截 class", async () => {
    const repositoryModule = await import("./world-repository");

    expect("WorldRepository" in repositoryModule).toBe(false);
    expect("createWorldRepositoryAuthority" in repositoryModule).toBe(true);
  });

  test("RuntimeMvpHost 不暴露任意 evidence 入库，只接纳受信 Runtime 与 evaluator 输出", async () => {
    const host = new RuntimeMvpHost();
    const base = host.write(createInitialSnapshot());
    const observed = host.readRefRecord();
    const forgedTerminal = deepFreeze({
      ...base,
      id: "snapshot:terminal-plain-forgery" as const,
      parentId: base.id,
      source: "runtime-terminal" as const,
      entities: base.entities.map((entity) => ({
        ...entity,
        state: {
          ...entity.state,
          pose: {
            ...entity.state.pose,
            position: [0, 0, 99] as const,
          },
          linearVelocity: [Number.NaN, 0, 0] as const,
        },
      })),
    });
    const forgedEpisode = deepFreeze({
      id: "episode:plain-forgery" as const,
      baseSnapshotId: base.id,
      programId: "program:not-executed" as const,
      runtimeProfileId: "runtime:not-executed" as const,
      explicitInputs: { runId: "run:not-executed" as const },
      completion: "completed" as const,
      samples: [],
      events: [],
      terminalSnapshot: forgedTerminal,
      runtimeEvidence: {
        provider: "Fake Runtime",
        version: "0",
        modelFormat: "MJCF" as const,
      },
    });
    const forgedEvaluation = deepFreeze({
      id: "evaluation:plain-forgery" as const,
      evaluatorId: "evaluator:stable-landing-v1" as const,
      episodeId: forgedEpisode.id,
      contractId: LANDING_SUCCESS_CONTRACT.id,
      passed: true,
      metrics: {
        terminalCenterHeight: Number.NaN,
        heightError: Number.NaN,
        terminalLinearSpeed: Number.NaN,
      },
    });

    expect("recordEpisode" in host).toBe(false);
    expect("recordEvaluation" in host).toBe(false);
    expect(() =>
      host.adopt(forgedEpisode.id, forgedEvaluation.id, observed),
    ).toThrow("Episode 尚未登记");
    expect(host.readRefRecord()).toBe(observed);

    const run = await host.runCurrent(deepFreeze({ runId: "run:trusted-host" }));
    const evaluation = host.evaluateEpisode(run.episode.id);
    const adopted = host.adopt(run.episode.id, evaluation.id, run.baseRef);

    expect(evaluation.passed).toBe(true);
    expect(adopted.status).toBe("updated");
    expect(host.readRef()).toBe(run.episode.terminalSnapshot);
  });

  test("另一个 lexical authority 只能写入自己拥有的 Repository", async () => {
    const host = new RuntimeMvpHost();
    const base = host.write(createInitialSnapshot());
    const observed = host.readRefRecord();
    const outsider = createWorldRepositoryAuthority();
    outsider.repository.write(createInitialSnapshot());
    const episode = await runFallingCube(
      base,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:foreign-authority" }),
    );

    outsider.evidence.recordEpisode(episode);
    expect(() =>
      host.adopt(
        episode.id,
        "evaluation:foreign-authority" as const,
        observed,
      ),
    ).toThrow("Episode 尚未登记");
    expect(host.readRefRecord()).toBe(observed);
    expect(() => host.readSnapshot(episode.terminalSnapshot.id)).toThrow(
      "Repository 中不存在",
    );
    expect(outsider.repository.readSnapshot(episode.terminalSnapshot.id)).toBe(
      episode.terminalSnapshot,
    );
  });

  test("root write 初始化 version 1，edit 只记录 child，advance 才推进 ref", () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const initialRef = repository.readRefRecord();
    const edited = repository.editCubeHeight(base.id, 3.1);

    expect(initialRef).toEqual({
      name: "world:current",
      snapshotId: base.id,
      version: 1,
    });
    expect(repository.readRef()).toBe(base);

    const result = repository.advance(edited.id, initialRef);

    expect(result.status).toBe("updated");
    expect(result.operation).toBe("advance");
    expect(repository.readRef()).toBe(edited);
    expect(repository.readRefRecord().version).toBe(2);
  });

  test("stale advance 不改变 ref，snapshot 相同但 version 过期也不能绕过 CAS", () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const observed = repository.readRefRecord();
    const first = repository.editCubeHeight(base.id, 2.6);
    const second = repository.editCubeHeight(base.id, 3.2);

    expect(repository.advance(first.id, observed).status).toBe("updated");
    const afterFirst = repository.readRefRecord();
    const staleBranch = repository.advance(second.id, observed);

    expect(staleBranch.status).toBe("stale_ref");
    expect(repository.readRef()).toBe(first);
    expect(repository.readRefRecord()).toBe(afterFirst);

    const child = repository.editCubeHeight(first.id, 3.4);
    const sameSnapshotStaleVersion = repository.advance(
      child.id,
      deepFreeze({ ...afterFirst, version: afterFirst.version - 1 }),
    );

    expect(sameSnapshotStaleVersion.status).toBe("stale_ref");
    expect(repository.readRefRecord()).toBe(afterFirst);
  });

  test("record Episode 与 Evaluation 不推进 ref，合法 evidence 才能 adopt", async () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const observed = repository.readRefRecord();
    const episode = await runFallingCube(
      base,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:authority-happy" }),
    );
    const evaluation = evaluateEpisode(episode, LANDING_SUCCESS_CONTRACT);

    repository.recordEpisode(episode);
    repository.recordEvaluation(evaluation);
    expect(repository.readRef()).toBe(base);
    expect(repository.readRefRecord()).toBe(observed);

    const result = repository.adopt(
      episode.id,
      evaluation.id,
      ADOPT_RUNTIME_MVP_POLICY.id,
      observed,
    );

    expect(result.status).toBe("updated");
    expect(result.operation).toBe("adopt");
    expect(repository.readRef()).toBe(episode.terminalSnapshot);
    expect(repository.readRefRecord().version).toBe(2);

    const repeated = repository.adopt(
      episode.id,
      evaluation.id,
      ADOPT_RUNTIME_MVP_POLICY.id,
      observed,
    );
    expect(repeated.status).toBe("stale_ref");
    expect(repository.readRefRecord().version).toBe(2);
  });

  test("未登记或失败的 Evaluation 不能 adopt", async () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const observed = repository.readRefRecord();
    const episode = await runFallingCube(
      base,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:authority-failed-evaluation" }),
    );
    const passed = evaluateEpisode(episode, LANDING_SUCCESS_CONTRACT);
    const failed = deepFreeze({
      ...passed,
      id: "evaluation:authority-forced-fail" as const,
      passed: false,
    }) as EvaluationRecord;

    repository.recordEpisode(episode);
    expect(() =>
      repository.adopt(
        episode.id,
        passed.id,
        ADOPT_RUNTIME_MVP_POLICY.id,
        observed,
      ),
    ).toThrow("EvaluationRecord 尚未登记");

    repository.recordEvaluation(failed);
    expect(() =>
      repository.adopt(
        episode.id,
        failed.id,
        ADOPT_RUNTIME_MVP_POLICY.id,
        observed,
      ),
    ).toThrow("Evaluation 未通过 AdoptPolicy");
    expect(repository.readRefRecord()).toBe(observed);
  });

  test("Episode、evaluator、contract 或 policy 任一错配都不能 adopt", async () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const observed = repository.readRefRecord();
    const firstEpisode = await runFallingCube(
      base,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:authority-first" }),
    );
    const secondEpisode = await runFallingCube(
      base,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:authority-second" }),
    );
    const firstEvaluation = evaluateEpisode(firstEpisode, LANDING_SUCCESS_CONTRACT);
    const secondEvaluation = evaluateEpisode(secondEpisode, LANDING_SUCCESS_CONTRACT);
    const wrongEvaluator = deepFreeze({
      ...firstEvaluation,
      id: "evaluation:authority-wrong-evaluator" as const,
      evaluatorId: "evaluator:other" as const,
    }) as EvaluationRecord;
    const wrongContract = deepFreeze({
      ...firstEvaluation,
      id: "evaluation:authority-wrong-contract" as const,
      contractId: "success:other" as never,
    }) as EvaluationRecord;

    repository.recordEpisode(firstEpisode);
    repository.recordEpisode(secondEpisode);
    repository.recordEvaluation(firstEvaluation);
    repository.recordEvaluation(secondEvaluation);
    repository.recordEvaluation(wrongEvaluator);
    repository.recordEvaluation(wrongContract);

    expect(() =>
      repository.adopt(
        firstEpisode.id,
        secondEvaluation.id,
        ADOPT_RUNTIME_MVP_POLICY.id,
        observed,
      ),
    ).toThrow("Evaluation 与 Episode 不匹配");
    expect(() =>
      repository.adopt(
        firstEpisode.id,
        wrongEvaluator.id,
        ADOPT_RUNTIME_MVP_POLICY.id,
        observed,
      ),
    ).toThrow("evaluator 不满足 AdoptPolicy");
    expect(() =>
      repository.adopt(
        firstEpisode.id,
        wrongContract.id,
        ADOPT_RUNTIME_MVP_POLICY.id,
        observed,
      ),
    ).toThrow("contract 不满足 AdoptPolicy");
    expect(() =>
      repository.adopt(
        firstEpisode.id,
        firstEvaluation.id,
        "adopt-policy:other" as never,
        observed,
      ),
    ).toThrow("请求的 AdoptPolicy 不是 Host 注册 policy");
    expect(repository.readRefRecord()).toBe(observed);
  });

  test("未登记 Episode 不能通过 terminal Snapshot 单独进入 adopt", async () => {
    const repository = createRepository();
    const base = repository.write(createInitialSnapshot());
    const observed = repository.readRefRecord();
    const episode = await runFallingCube(
      base,
      FALLING_CUBE_PROGRAM,
      MUJOCO_PROFILE,
      deepFreeze({ runId: "run:authority-unrecorded" }),
    );
    const evaluation = evaluateEpisode(episode, LANDING_SUCCESS_CONTRACT);

    repository.record(episode.terminalSnapshot);
    expect(() => repository.recordEvaluation(evaluation)).toThrow(
      "Episode 尚未登记",
    );
    expect(() =>
      repository.adopt(
        episode.id,
        evaluation.id,
        ADOPT_RUNTIME_MVP_POLICY.id,
        observed,
      ),
    ).toThrow("Episode 尚未登记");
    expect(repository.readRefRecord()).toBe(observed);
  });
});
