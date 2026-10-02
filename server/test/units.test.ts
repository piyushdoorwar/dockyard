import { describe, expect, it } from "vitest";
import {
  dedupePorts,
  groupStacks,
  splitRepoTag,
  toContainerSummary,
  toImageSummary,
  toVolumeSummary,
} from "../src/mappers.js";
import { computeStats } from "../src/stats.js";
import { createDemuxer, LineSplitter, splitTimestamp } from "../src/streams.js";
import { summariseDiskUsage } from "../src/routes/system.js";
import { withDefaultTag } from "../src/routes/images.js";
import { rawContainer } from "./helpers.js";
import type Docker from "dockerode";

function frame(type: 1 | 2, text: string): Buffer {
  const payload = Buffer.from(text);
  const header = Buffer.alloc(8);
  header[0] = type;
  header.writeUInt32BE(payload.length, 4);
  return Buffer.concat([header, payload]);
}

describe("dedupePorts", () => {
  it("collapses IPv4/IPv6 duplicates and sorts", () => {
    const ports = dedupePorts([
      { PrivatePort: 80, PublicPort: 8080, Type: "tcp", IP: "::" },
      { PrivatePort: 80, PublicPort: 8080, Type: "tcp", IP: "0.0.0.0" },
      { PrivatePort: 22, Type: "tcp" },
    ] as Docker.Port[]);
    expect(ports).toEqual([
      { privatePort: 22, publicPort: undefined, type: "tcp", ip: undefined },
      { privatePort: 80, publicPort: 8080, type: "tcp", ip: "0.0.0.0" },
    ]);
  });
});

describe("toContainerSummary", () => {
  it("maps compose labels, strips the leading slash and flags itself", () => {
    const c = toContainerSummary(
      rawContainer({
        Id: "0123456789abcdef",
        Names: ["/sample-api-db-1"],
        Labels: {
          "com.docker.compose.project": "sample-api",
          "com.docker.compose.service": "db",
          "com.docker.compose.project.working_dir": "/home/repos/demo/sample-api",
          "com.dockyard.runtime": "true",
        },
      }),
    );
    expect(c).toMatchObject({
      shortId: "0123456789ab",
      name: "sample-api-db-1",
      project: "sample-api",
      service: "db",
      projectDir: "/home/repos/demo/sample-api",
      isSelf: true,
    });
  });

  it("leaves standalone containers without a project", () => {
    expect(toContainerSummary(rawContainer({ Id: "x" }))).toMatchObject({ project: null, service: null, isSelf: false });
  });
});

describe("groupStacks", () => {
  const c = (id: string, project: string | undefined, state: string) =>
    toContainerSummary(
      rawContainer({ Id: id, State: state, Labels: project ? { "com.docker.compose.project": project } : {} }),
    );

  it("groups by project with running / partial / stopped status", () => {
    const stacks = groupStacks([
      c("a1", "alpha", "running"),
      c("a2", "alpha", "running"),
      c("b1", "beta", "running"),
      c("b2", "beta", "exited"),
      c("g1", "gamma", "exited"),
      c("solo", undefined, "running"),
    ]);
    expect(stacks.map((s) => [s.name, s.status, s.running, s.total])).toEqual([
      ["alpha", "running", 2, 2],
      ["beta", "partial", 1, 2],
      ["gamma", "stopped", 0, 1],
    ]);
  });
});

describe("image references", () => {
  it.each([
    ["nginx:1.27", ["nginx", "1.27"]],
    ["localhost:5000/team/app", ["localhost:5000/team/app", "latest"]],
    ["localhost:5000/team/app:2", ["localhost:5000/team/app", "2"]],
    ["ghcr.io/acme/x@sha256:abc", ["ghcr.io/acme/x", "<none>"]],
  ])("splitRepoTag(%s)", (ref, expected) => {
    expect(splitRepoTag(ref)).toEqual(expected);
  });

  it.each([
    ["nginx", "nginx:latest"],
    ["nginx:1.27", "nginx:1.27"],
    ["localhost:5000/app", "localhost:5000/app:latest"],
    ["app@sha256:abc", "app@sha256:abc"],
  ])("withDefaultTag(%s)", (ref, expected) => {
    expect(withDefaultTag(ref)).toBe(expected);
  });

  it("marks untagged images as dangling and counts containers", () => {
    const img = toImageSummary(
      { Id: "sha256:deadbeefcafe0000", RepoTags: ["<none>:<none>"], RepoDigests: [], Size: 10, Created: 1 } as unknown as Docker.ImageInfo,
      new Map([["sha256:deadbeefcafe0000", 2]]),
    );
    expect(img).toMatchObject({ repository: "<none>", tag: "<none>", dangling: true, containers: 2, shortId: "deadbeefcafe" });
  });
});

describe("toVolumeSummary", () => {
  it("treats Docker's -1 size as unknown", () => {
    const v = toVolumeSummary(
      { Name: "data", Driver: "local", Mountpoint: "/x", Labels: {}, Scope: "local" } as unknown as Docker.VolumeInspectInfo,
      new Map([["data", { Name: "data", UsageData: { Size: -1, RefCount: -1 } }]]),
    );
    expect(v.size).toBeNull();
    expect(v.refCount).toBeNull();
  });
});

describe("LineSplitter", () => {
  it("carries partial lines across chunks and strips CR", () => {
    const s = new LineSplitter();
    expect(s.push("one\r\ntw")).toEqual(["one"]);
    expect(s.push("o\nthree")).toEqual(["two"]);
    expect(s.flush()).toEqual(["three"]);
    expect(s.flush()).toEqual([]);
  });
});

describe("createDemuxer", () => {
  it("splits stdout/stderr frames, even when a frame spans chunks", () => {
    const got: [string, string][] = [];
    const push = createDemuxer((stream, payload) => got.push([stream, payload.toString()]));
    const all = Buffer.concat([frame(1, "hello\n"), frame(2, "oops\n")]);
    push(all.subarray(0, 5));
    push(all.subarray(5, 17));
    push(all.subarray(17));
    expect(got).toEqual([
      ["stdout", "hello\n"],
      ["stderr", "oops\n"],
    ]);
  });
});

describe("splitTimestamp", () => {
  it("splits Docker's RFC3339 prefix", () => {
    expect(splitTimestamp("2026-10-01T10:00:00.123456789Z listening on 80")).toEqual({
      ts: "2026-10-01T10:00:00.123456789Z",
      text: "listening on 80",
    });
  });
  it("leaves other lines alone", () => {
    expect(splitTimestamp("plain line")).toEqual({ ts: null, text: "plain line" });
  });
});

describe("computeStats", () => {
  it("matches docker stats arithmetic (cgroup v2)", () => {
    const s = computeStats({
      read: "2026-10-01T00:00:00Z",
      cpu_stats: { cpu_usage: { total_usage: 2_000 }, system_cpu_usage: 20_000, online_cpus: 4 },
      precpu_stats: { cpu_usage: { total_usage: 1_000 }, system_cpu_usage: 10_000 },
      memory_stats: { usage: 300, limit: 1000, stats: { inactive_file: 100 } },
      networks: { eth0: { rx_bytes: 5, tx_bytes: 7 }, eth1: { rx_bytes: 1, tx_bytes: 1 } },
      blkio_stats: { io_service_bytes_recursive: [{ op: "read", value: 10 }, { op: "Write", value: 20 }] },
      pids_stats: { current: 3 },
    });
    expect(s).toEqual({
      cpuPercent: 40,
      memUsage: 200,
      memLimit: 1000,
      memPercent: 20,
      netRx: 6,
      netTx: 8,
      blockRead: 10,
      blockWrite: 20,
      pids: 3,
      timestamp: "2026-10-01T00:00:00Z",
    });
  });

  it("reports 0% CPU on the first sample (no previous reading)", () => {
    expect(computeStats({ cpu_stats: { cpu_usage: { total_usage: 5 }, system_cpu_usage: 5 } }).cpuPercent).toBe(0);
  });

  it("subtracts cgroup v1's hierarchical inactive_file, like the CLI", () => {
    const s = computeStats({ memory_stats: { usage: 1000, limit: 4000, stats: { total_inactive_file: 400, inactive_file: 100, cache: 600 } } });
    expect(s.memUsage).toBe(600);
  });

  it("computes Windows CPU from sample timestamps and processor count", () => {
    const s = computeStats({
      read: "2026-10-01T00:00:01.000000000Z",
      preread: "2026-10-01T00:00:00.000000000Z",
      num_procs: 2,
      // 1s on 2 processors is 2e7 ticks of 100ns; 5e6 used is 25%.
      cpu_stats: { cpu_usage: { total_usage: 15_000_000 } },
      precpu_stats: { cpu_usage: { total_usage: 10_000_000 } },
      memory_stats: { privateworkingset: 1234 },
    });
    expect(s.cpuPercent).toBe(25);
    expect(s.memUsage).toBe(1234);
  });
});

describe("summariseDiskUsage", () => {
  it("totals each category and what can be reclaimed", () => {
    const u = summariseDiskUsage({
      LayersSize: 1000,
      Images: [
        { Size: 600, SharedSize: 100, Containers: 1 },
        { Size: 400, SharedSize: 100, Containers: 0 },
      ],
      Containers: [
        { SizeRw: 10, State: "running" },
        { SizeRw: 5, State: "exited" },
      ],
      Volumes: [{ UsageData: { Size: 50, RefCount: 0 } }, { UsageData: { Size: 70, RefCount: 1 } }, { UsageData: { Size: -1, RefCount: -1 } }],
      BuildCache: [{ Size: 30, InUse: false }, { Size: 20, InUse: true }],
    });
    expect(u.images).toEqual({ count: 2, size: 1000, reclaimable: 300 });
    expect(u.containers).toEqual({ count: 2, size: 15, reclaimable: 5 });
    expect(u.volumes).toEqual({ count: 3, size: 120, reclaimable: 50 });
    expect(u.buildCache).toEqual({ count: 2, size: 50, reclaimable: 30 });
    expect(u.total).toBe(1185);
  });
});
