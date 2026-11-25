// Numbers copied from the paper's tables (paper source of 18 Nov 2026, commit 65b5526).
// Every value is copied from the LaTeX tables named below; nothing here is re-computed.
// Reader for all rows: Qwen2.5-VL-7B, frozen. Accuracy in percent.

window.MEM_RESULTS = {

  // tables/table_main.tex - "Comparison at matched memory and readout"
  main: {
    benchmarks: ["LVBench", "LongVideoBench", "Video-MME", "TimeScope", "OVO-Bench", "StreamingBench", "Average"],
    groups: [
      { label: "Long video", from: 0, to: 3 },
      { label: "Streaming", from: 4, to: 5 },
      { label: "All six", from: 6, to: 6 }
    ],
    methods: [
      { id: "full", name: "Base model, full memory (no cap)", role: "reference",
        note: "Stores every visual token without a cap but reads through the same readout budget. Not ranked." },
      { id: "uniform", name: "Uniform frames (needs the full past video)", role: "hidden" },
      { id: "simplestream", name: "SimpleStream", role: "baseline" },
      { id: "keyrec", name: "KeyRec", role: "baseline" },
      { id: "causalmem", name: "CausalMem", role: "baseline" },
      { id: "savemem", name: "SAVEMem", role: "baseline" },
      { id: "ours", name: "Memryoshka", role: "ours" },
      { id: "ours4", name: "Memryoshka + 4 recent frames", role: "ours4" }
    ],
    budgets: [
      { id: "7.2", label: "7.2 MB", readout: 1000, rows: {
        full:         [44.5, 54.4, 49.6, 85.6, 52.5, 69.9, 59.4],
        uniform:      [30.1, 41.8, 43.6, 27.8, 57.0, 76.2, 46.1],
        simplestream: [27.2, 39.9, 41.5, 24.4, 62.3, 78.1, 45.6],
        keyrec:       [27.2, 41.0, 39.8, 24.4, 62.4, 77.5, 45.4],
        causalmem:    [33.4, 46.6, 45.2, 57.2, 61.8, 78.3, 53.8],
        savemem:      [27.9, 36.2, 40.0, 26.1, 64.6, 79.8, 45.8],
        ours:         [45.7, 52.3, 50.1, 86.1, 53.2, 70.6, 59.7],
        ours4:        [45.5, 51.4, 50.1, 84.4, 60.3, 80.1, 62.0] } },
      { id: "14.3", label: "14.3 MB", readout: 2000, rows: {
        full:         [46.9, 56.4, 50.8, 94.4, 54.9, 72.9, 62.7],
        uniform:      [34.4, 47.0, 49.7, 41.1, 57.4, 77.3, 51.2],
        simplestream: [27.8, 41.7, 42.7, 30.0, 63.0, 79.8, 47.5],
        keyrec:       [27.9, 42.9, 41.3, 24.4, 61.9, 78.7, 46.2],
        causalmem:    [35.1, 49.5, 45.9, 60.0, 62.7, 80.3, 55.6],
        savemem:      [28.9, 39.0, 41.1, 32.2, 64.2, 81.1, 47.8],
        ours:         [48.4, 58.7, 52.4, 93.9, 54.7, 73.0, 63.5],
        ours4:        [47.2, 57.5, 52.6, 88.9, 59.7, 81.6, 64.6] } },
      { id: "28.7", label: "28.7 MB", readout: 4000, rows: {
        full:         [49.4, 58.2, 52.7, 95.0, 56.6, 76.0, 64.6],
        uniform:      [36.5, 48.9, 53.1, 47.2, 59.4, 79.4, 54.1],
        simplestream: [30.7, 44.0, 43.3, 30.0, 61.2, 80.2, 48.2],
        keyrec:       [29.6, 43.3, 42.2, 27.8, 61.8, 79.9, 47.4],
        causalmem:    [35.6, 52.3, 45.4, 64.4, 62.4, 80.7, 56.8],
        savemem:      [32.1, 43.4, 43.0, 37.2, 64.5, 80.9, 50.2],
        ours:         [49.7, 58.0, 53.7, 95.0, 56.6, 76.1, 64.8],
        ours4:        [50.0, 56.9, 54.2, 95.6, 59.4, 81.6, 66.3] } }
    ]
  },

  // tables/table_tradeoff.tex - "Temporal coverage vs. fidelity" (LVBench, 1,000-position readout, same writer).
  // frames = % of frames still in memory, tok = average tokens per kept frame,
  // oracle = retrieval with the annotated evidence times, clip = LongCLIP retrieval (the real system).
  tradeoff: {
    caps: ["1.8 MB", "7.2 MB", "28.7 MB"],
    fixed: [
      // the 4,096-bit row is the full PCA code (512 components x 8 bits), which equals the nested code at its full length
      { bits: 256,  frames: [15.3, 58.4, 100.0], tok: [63, 66, 161], oracle: [47.9, 54.6, 56.6], clip: [40.6, 42.7, 42.2] },
      { bits: 512,  frames: [12.0, 45.0, 98.3],  tok: [43, 48, 93],  oracle: [49.0, 55.8, 59.9], clip: [43.0, 44.1, 45.3] },
      { bits: 1024, frames: [9.8, 33.2, 90.6],   tok: [28, 34, 52],  oracle: [46.6, 53.8, 60.1], clip: [40.3, 44.0, 47.0] },
      { bits: 2048, frames: [8.1, 24.7, 78.1],   tok: [18, 24, 31],  oracle: [42.4, 50.6, 57.5], clip: [38.5, 41.8, 46.3] },
      { bits: 4096, frames: [6.5, 18.8, 61.0],   tok: [11, 16, 20],  oracle: [39.6, 46.7, 53.9], clip: [36.8, 41.5, 44.2] }
    ],
    adaptive: { bitsRange: "545 to 624", frames: [11.2, 39.2, 95.2], tok: [45, 50, 80],
                oracle: [49.4, 55.8, 59.9], clip: [43.2, 45.7, 47.1] }
  },

  // tables/table_ablations.tex - Video-MME long split and LVBench, 1,000-position readout
  ablations: {
    columns: ["Video-MME, 1.8 MB", "Video-MME, 7.2 MB", "LVBench, 1.8 MB", "LVBench, 7.2 MB"],
    rows: [
      { group: null, name: "Memryoshka (default)", v: [50.2, 50.1, 43.2, 45.7], isDefault: true },
      { group: "What the writer values", name: "Without token importance", v: [48.1, 49.3, 39.1, 43.4] },
      { group: "What the writer values", name: "Without frame novelty", v: [48.9, 49.6, 39.0, 42.8] },
      { group: "What the writer values", name: "Prefix value grows linearly with length", v: [49.3, 50.0, 36.8, 41.5] },
      { group: "Quality floor (default 0.5)", name: "Floor 0 (no floor)", v: [43.1, 44.4, 38.8, 37.0] },
      { group: "Quality floor (default 0.5)", name: "Floor 0.3", v: [48.9, 48.8, 41.0, 45.6] },
      { group: "Quality floor (default 0.5)", name: "Floor 0.7", v: [51.1, 51.1, 39.9, 43.8] },
      { group: "Quality floor (default 0.5)", name: "Floor 0.9", v: [50.7, 50.0, 38.9, 41.5] },
      { group: "Share of each frame's importance read (default 0.8)", name: "0.5", v: [50.1, 50.8, 39.2, 42.8] },
      { group: "Share of each frame's importance read (default 0.8)", name: "0.7", v: [50.1, 49.8, 42.4, 43.4] },
      { group: "Share of each frame's importance read (default 0.8)", name: "1.0", v: [49.6, 49.0, 43.2, 45.8] }
    ]
  },

  // Settings where Memryoshka scores above a larger reference (paper Table 1 at 14.3 MB, Figure 4).
  higher: [
    { what: "LongVideoBench, 14.3 MB", ours: 58.7, ref: 56.4, refName: "uncapped memory" },
    { what: "Video-MME, 14.3 MB", ours: 52.4, ref: 50.8, refName: "uncapped memory" },
    { what: "LVBench, 14.3 MB", ours: 48.4, ref: 46.9, refName: "uncapped memory" },
    { what: "Audio and video, 7.2 MB", ours: 33.7, ref: 32.0, refName: "full input, about 1.1 GB per video" },
    { what: "Audio and video, 114.7 MB", ours: 37.5, ref: 32.0, refName: "full input, about 1.1 GB per video" },
    { what: "Robot policy, 256 KiB", ours: 95, ref: 94, refName: "the policy's own history, 14,340 KiB" }
  ]
  // The numbers quoted in the text of Figures 06, 08 and 10 are in index.html, copied from sec/4_exps.tex.
};
