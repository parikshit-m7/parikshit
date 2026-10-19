const test = require("node:test");
const assert = require("node:assert/strict");
const { buildListingSearch } = require("../utils/listingSearch");

test("searches listing text fields without changing the header search value", () => {
  const { mongoFilter, search } = buildListingSearch("  Goa  ");

  assert.deepEqual(
    mongoFilter.$or.map((condition) => Object.keys(condition)[0]),
    ["title", "description", "location", "country"]
  );
  assert.ok(mongoFilter.$or.every((condition) => {
    const pattern = Object.values(condition)[0];
    return pattern instanceof RegExp && pattern.source === "Goa" && pattern.flags === "i";
  }));
  assert.equal(search, "Goa");
});

test("treats search input as literal text rather than a regular expression", () => {
  const { mongoFilter } = buildListingSearch("Goa.*");
  const pattern = mongoFilter.$or[0].title;

  assert.equal(pattern.test("Goa.*"), true);
  assert.equal(pattern.test("Goa-anything"), false);
});

test("returns all listings for empty or non-string input and caps long input", () => {
  assert.deepEqual(buildListingSearch("   "), {
    mongoFilter: {},
    search: "",
  });
  assert.deepEqual(buildListingSearch({ search: "Goa" }), {
    mongoFilter: {},
    search: "",
  });
  assert.equal(buildListingSearch("a".repeat(120)).search.length, 100);
});
