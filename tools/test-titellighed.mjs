// node --test tools/test-titellighed.mjs
// Mailens titel parret med annoncen, når titlen er rettet på Vinted
// (_shared/titellighed.ts). Titlerne er fra vinted_mails 52 og 57 og listings.
import test from "node:test";
import assert from "node:assert/strict";
import { bedsteTitel, emneTitel, titelLighed } from "../supabase/functions/_shared/titellighed.ts";

const PARKA = ["Teeshoppen termojakke sort str. L", "Teeshoppen parka vinterjakke str. L, sort. Ny og ubrugt"];
const ANDRE = [
  ["Teeshoppen Hooded Let Puffer Jakke sort str. L"],
  ["Jack & Jones sort jeans 164 - helt ny med mærke"],
  ["Mads Nørgaard hættesweatshirt str. 14 - grå"],
];

test("salgsmailen (52) finder parkaen, selv om titlen er rettet på Vinted", () => {
  const mail = "Teeshoppen Edmund lang parka vinterjakke str. L, sort. Ny og ubrugt";
  assert.equal(bedsteTitel([ANDRE[0], PARKA, ANDRE[1], ANDRE[2]], [mail]), 1);
});

test("ordreopdateringens afskårne emne (57)", () => {
  const t = emneTitel("Ordreopdatering til Teeshoppen Edmund lang parka vinterjakke");
  assert.equal(t, "Teeshoppen Edmund lang parka vinterjakke");
  assert.equal(bedsteTitel([ANDRE[0], PARKA], [t]), 1);
});

test("emnet uden fwd og fragtmærkatets frist", () => {
  assert.equal(emneTitel("Fwd: Teeshoppen Edmund lang parka vinterjakke str. L, sort. Ny og fragtmærkat – skal anvendes inden d. 26.10.2026"),
    "Teeshoppen Edmund lang parka vinterjakke str. L, sort. Ny og");
  assert.equal(emneTitel("Sofie Schnoor strik Fragtkode: BRUGES INDEN D. d. 16.10.2026"), "Sofie Schnoor strik");
});

test("kun entydigt: to næsten ens varer giver intet", () => {
  const a = [["Teeshoppen parka vinterjakke sort str. L"]], b = [["Teeshoppen parka vinterjakke sort str. M"]];
  assert.equal(bedsteTitel([a[0], b[0]], ["Teeshoppen parka vinterjakke sort"]), null);
});

test("for lidt til fælles giver intet", () => {
  assert.equal(bedsteTitel(ANDRE, ["Teeshoppen Edmund lang parka"]), null);
  assert.ok(titelLighed("Nike sko", "Adidas sko") < 0.6);
});
