import { describe, expect, it } from "vitest";

import {
  ARABIC_ALPHABET,
  ARABIC_LETTERS,
  HARAKAT,
  LETTER_FORMS,
  MAKHARIJ,
  MAKHRAJ_IDS,
  READING_LATTICE,
  conceptById,
  conceptIdToUnitId,
  conceptsOfKind,
  formConceptId,
  formsOfLetter,
  isConceptId,
  letterById,
  letterHarakahConceptId,
  lettersOfMakhraj,
  makhrajOfLetter,
  prerequisiteClosure,
  topologicalOrder,
  validateLattice,
  type ReadingLattice,
} from "./concepts";

const LABEL_KEY_RE = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)+$/;
const NON_CONNECTING = ["letter.alef", "letter.dal", "letter.thal", "letter.reh", "letter.zain", "letter.waw"];

describe("READING_LATTICE integrity", () => {
  it("validates with no errors", () => {
    expect(validateLattice()).toEqual([]);
  });

  it("is acyclic — a deterministic topological order exists over every concept", () => {
    const order = topologicalOrder();
    expect(order).not.toBeNull();
    expect(order?.length).toBe(READING_LATTICE.concepts.length);
    // Running it twice gives the identical order (no set-iteration nondeterminism).
    expect(topologicalOrder()).toEqual(order);
  });

  it("places every prerequisite before its dependent in the topological order", () => {
    const order = topologicalOrder();
    expect(order).not.toBeNull();
    const position = new Map((order ?? []).map((id, index) => [id, index]));
    for (const concept of READING_LATTICE.concepts) {
      for (const prerequisite of concept.prerequisites) {
        expect(position.get(prerequisite)).toBeLessThan(position.get(concept.id) ?? -1);
      }
    }
  });

  it("names only prerequisites that exist", () => {
    const ids = new Set(READING_LATTICE.concepts.map((concept) => concept.id));
    for (const concept of READING_LATTICE.concepts) {
      for (const prerequisite of concept.prerequisites) {
        expect(ids.has(prerequisite)).toBe(true);
      }
    }
  });

  it("makes every concept reachable by unlocking from the roots", () => {
    const unlocked = new Set<string>();
    let progressed = true;
    while (progressed) {
      progressed = false;
      for (const concept of READING_LATTICE.concepts) {
        if (unlocked.has(concept.id)) continue;
        if (concept.prerequisites.every((prerequisite) => unlocked.has(prerequisite))) {
          unlocked.add(concept.id);
          progressed = true;
        }
      }
    }
    expect(unlocked.size).toBe(READING_LATTICE.concepts.length);
  });

  it("derives deduplicated, sorted prerequisite edges", () => {
    const edges = READING_LATTICE.edges;
    const keys = edges.map((edge) => `${edge.from} ${edge.to}`);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual(keys);
    const expected = READING_LATTICE.concepts.reduce(
      (total, concept) => total + new Set(concept.prerequisites).size,
      0,
    );
    expect(edges.length).toBe(expected);
  });

  it("uses ASCII ids and i18n label keys everywhere — no literal text, no Arabic in an id", () => {
    for (const concept of READING_LATTICE.concepts) {
      expect(isConceptId(concept.id)).toBe(true);
      // eslint-disable-next-line no-control-regex
      expect(/^[\x00-\x7F]*$/.test(concept.id)).toBe(true);
      expect(LABEL_KEY_RE.test(concept.labelKey)).toBe(true);
    }
  });

  it("never carries more than a letter plus a mark — a phrase cannot hide in the data", () => {
    for (const concept of READING_LATTICE.concepts) {
      const points = concept.letterCodepoints ?? [];
      for (const point of points) {
        expect([...point].length).toBe(1);
      }
      if (concept.kind === "letter" || concept.kind === "letter_form") {
        expect(points.length).toBe(1);
      }
      if (concept.kind === "letter_harakah") {
        expect(points.length).toBeLessThanOrEqual(2);
      }
    }
  });

  it("bridges concept ids into the memory engine's unit grammar", () => {
    expect(conceptIdToUnitId("letter.beh.fathah")).toBe("c:letter.beh.fathah");
  });
});

describe("the alphabet", () => {
  it("carries all twenty-eight letters, in hijāʾī order", () => {
    expect(ARABIC_ALPHABET).toHaveLength(28);
    expect(ARABIC_ALPHABET.map((letter) => letter.order)).toEqual(
      Array.from({ length: 28 }, (_unused, index) => index + 1),
    );
  });

  it("gives every letter a distinct codepoint", () => {
    const codepoints = ARABIC_LETTERS.map((letter) => letter.codepoint);
    expect(new Set(codepoints).size).toBe(codepoints.length);
    expect(new Set(ARABIC_ALPHABET.map((letter) => letter.codepoint)).size).toBe(28);
  });

  it("records hamzah as a twenty-ninth teaching concept outside the alphabet", () => {
    const hamzah = letterById("letter.hamza");
    expect(hamzah?.inAlphabet).toBe(false);
    expect(hamzah?.makhraj).toBe("makhraj.halq.aqsa");
    expect(ARABIC_LETTERS).toHaveLength(29);
    expect(conceptsOfKind("letter")).toHaveLength(29);
  });

  it("states each letter's codepoint and its U+ reference consistently", () => {
    for (const letter of ARABIC_LETTERS) {
      const point = letter.codepoint.codePointAt(0);
      expect(point).toBeDefined();
      expect(`U+${(point ?? 0).toString(16).toUpperCase().padStart(4, "0")}`).toBe(letter.unicode);
    }
  });
});

describe("makhārij", () => {
  it("has the classical seventeen in five regions", () => {
    expect(MAKHARIJ).toHaveLength(17);
    expect(MAKHRAJ_IDS).toHaveLength(17);
    expect(new Set(MAKHARIJ.map((group) => group.region))).toEqual(
      new Set(["jawf", "halq", "lisan", "shafatan", "khayshum"]),
    );
    expect(MAKHARIJ.filter((group) => group.region === "halq")).toHaveLength(3);
    expect(MAKHARIJ.filter((group) => group.region === "lisan")).toHaveLength(10);
    expect(MAKHARIJ.filter((group) => group.region === "shafatan")).toHaveLength(2);
  });

  it("partitions the letters — every letter sits in exactly one primary group", () => {
    const seen = new Map<string, number>();
    for (const group of MAKHRAJ_IDS) {
      for (const letter of lettersOfMakhraj(group)) {
        seen.set(letter.id, (seen.get(letter.id) ?? 0) + 1);
      }
    }
    expect(seen.size).toBe(ARABIC_LETTERS.length);
    for (const letter of ARABIC_LETTERS) {
      expect(seen.get(letter.id)).toBe(1);
    }
    const total = MAKHRAJ_IDS.reduce((sum, group) => sum + lettersOfMakhraj(group).length, 0);
    expect(total).toBe(29);
  });

  it("puts alif in al-jawf alone, and wāw and yāʾ at their consonantal places", () => {
    expect(lettersOfMakhraj("makhraj.jawf").map((letter) => letter.id)).toEqual(["letter.alef"]);
    expect(makhrajOfLetter("letter.waw")).toBe("makhraj.shafatan.shafatayn");
    expect(makhrajOfLetter("letter.yeh")).toBe("makhraj.lisan.wasat");
  });

  it("leaves al-khayshūm with no primary letter — it is the makhraj of the ghunnah", () => {
    expect(lettersOfMakhraj("makhraj.khayshum")).toEqual([]);
    const concept = conceptById("makhraj.khayshum");
    expect(concept?.letterCodepoints).toEqual([]);
    expect(concept?.prerequisites).toEqual(["letter.noon", "letter.meem"]);
    expect(conceptById("rule.ghunnah")?.makhraj).toBe("makhraj.khayshum");
  });

  it("assigns the throat letters to the three ḥalq places", () => {
    expect(lettersOfMakhraj("makhraj.halq.aqsa").map((letter) => letter.id).sort()).toEqual(
      ["letter.hamza", "letter.heh"].sort(),
    );
    expect(lettersOfMakhraj("makhraj.halq.wasat").map((letter) => letter.id).sort()).toEqual(
      ["letter.ain", "letter.hah"].sort(),
    );
    expect(lettersOfMakhraj("makhraj.halq.adna").map((letter) => letter.id).sort()).toEqual(
      ["letter.ghain", "letter.khah"].sort(),
    );
  });
});

describe("letter forms", () => {
  it("gives connecting letters all four positions", () => {
    expect(formsOfLetter(letterById("letter.beh")!)).toEqual([...LETTER_FORMS]);
    for (const form of LETTER_FORMS) {
      expect(conceptById(formConceptId("letter.beh", form))).not.toBeNull();
    }
  });

  it("gives the six non-connecting letters only the positions they actually take", () => {
    for (const id of NON_CONNECTING) {
      const letter = letterById(id);
      expect(letter?.connectsForward).toBe(false);
      expect(formsOfLetter(letter!)).toEqual(["isolated", "final"]);
      expect(conceptById(formConceptId(id, "initial"))).toBeNull();
      expect(conceptById(formConceptId(id, "medial"))).toBeNull();
    }
  });

  it("gives hamzah an isolated form only — it joins on neither side", () => {
    expect(formsOfLetter(letterById("letter.hamza")!)).toEqual(["isolated"]);
  });

  it("chains each form onto the one before it", () => {
    expect(conceptById(formConceptId("letter.beh", "isolated"))?.prerequisites).toEqual([
      "letter.beh",
    ]);
    expect(conceptById(formConceptId("letter.beh", "medial"))?.prerequisites).toEqual([
      formConceptId("letter.beh", "initial"),
    ]);
  });
});

describe("ḥarakāt, marks, madd and rules", () => {
  it("teaches the three short vowels in order, each depending on the last", () => {
    expect(HARAKAT.map((harakah) => harakah.id)).toEqual([
      "harakah.fathah",
      "harakah.dammah",
      "harakah.kasrah",
    ]);
    expect(conceptById("harakah.fathah")?.prerequisites).toEqual([]);
    expect(conceptById("harakah.kasrah")?.prerequisites).toEqual(["harakah.dammah"]);
  });

  it("builds a letter+ḥarakah concept for every letter and vowel", () => {
    const combos = conceptsOfKind("letter_harakah").filter((concept) =>
      concept.id.startsWith("letter."),
    );
    expect(combos).toHaveLength(29 * 3);
    const beh = conceptById(letterHarakahConceptId("letter.beh", "harakah.fathah"));
    expect(beh?.prerequisites).toEqual(["letter.beh", "harakah.fathah"]);
    expect(beh?.letterCodepoints).toHaveLength(2);
    expect(beh?.makhraj).toBe("makhraj.shafatan.shafatayn");
  });

  it("orders sukūn, shaddah, tanwīn and the four madd types behind the vowels", () => {
    expect(conceptById("sukun")?.prerequisites).toContain("harakah.kasrah");
    expect(conceptById("shaddah")?.prerequisites).toEqual(["sukun"]);
    expect(conceptsOfKind("tanwin").map((concept) => concept.id).sort()).toEqual(
      ["tanwin", "tanwin.damm", "tanwin.fath", "tanwin.kasr"].sort(),
    );
    expect(conceptsOfKind("madd").map((concept) => concept.id).sort()).toEqual(
      ["madd.badal", "madd.iwad", "madd.silah", "madd.tabii"].sort(),
    );
    expect(prerequisiteClosure("madd.iwad")).toContain("harakah.fathah");
  });

  it("returns a sorted, transitive prerequisite closure", () => {
    const closure = prerequisiteClosure("rule.noon_sakinah.ikhfa");
    expect([...closure].sort()).toEqual([...closure]);
    expect(closure).toContain("letter.noon");
    expect(closure).toContain("harakah.fathah");
    expect(closure).toContain("makhraj.khayshum");
    expect(closure).not.toContain("rule.noon_sakinah.ikhfa");
  });
});

describe("validateLattice on malformed input", () => {
  const base = { kind: "letter" as const, labelKey: "reading.concept.test", prerequisites: [] };

  it("reports an unknown prerequisite", () => {
    const lattice: ReadingLattice = {
      concepts: [{ ...base, id: "a" }, { ...base, id: "b", prerequisites: ["missing"] }],
      edges: [],
    };
    const codes = validateLattice(lattice).map((error) => error.code);
    expect(codes).toContain("unknown_prerequisite");
  });

  it("reports a cycle rather than silently ordering around it", () => {
    const lattice: ReadingLattice = {
      concepts: [
        { ...base, id: "a", prerequisites: ["b"] },
        { ...base, id: "b", prerequisites: ["a"] },
      ],
      edges: [],
    };
    const codes = validateLattice(lattice).map((error) => error.code);
    expect(codes).toContain("prerequisite_cycle");
    expect(topologicalOrder(lattice)).toBeNull();
  });

  it("reports a duplicate id, a self-prerequisite and a literal label", () => {
    const lattice: ReadingLattice = {
      concepts: [
        { ...base, id: "a" },
        { ...base, id: "a", labelKey: "Say the letter" },
        { ...base, id: "c", prerequisites: ["c"] },
      ],
      edges: [],
    };
    const codes = validateLattice(lattice).map((error) => error.code);
    expect(codes).toContain("duplicate_concept");
    expect(codes).toContain("invalid_label_key");
    expect(codes).toContain("self_prerequisite");
  });
});
