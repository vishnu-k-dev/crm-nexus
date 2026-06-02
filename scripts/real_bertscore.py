"""Canonical BERTScore (HuggingFace bert_score, roberta-large, rescale_with_baseline=True)
per the hackathon rubric. Reads data/crm_eval_results.json, computes F1 per pipeline."""
import json, os
from bert_score import score

HERE = os.path.dirname(os.path.abspath(__file__))
RESULTS = os.path.join(HERE, "..", "data", "crm_eval_results.json")

data = json.load(open(RESULTS, encoding="utf-8"))
results = data["results"]
refs = [(r.get("referenceAnswer") or "").strip() for r in results]

def answers(pipe):
    return [((r.get(pipe) or {}).get("answer") or "").strip() or "(no answer)" for r in results]

print(f"Scoring {len(results)} questions per pipeline (roberta-large, rescaled)...\n")
out = {}
for pipe in ["graphrag", "basicRag", "llmOnly"]:
    cands = answers(pipe)
    P, R, F1 = score(cands, refs, lang="en", rescale_with_baseline=True, verbose=False)
    P_raw, R_raw, F1_raw = score(cands, refs, lang="en", rescale_with_baseline=False, verbose=False)
    out[pipe] = {
        "f1_rescaled": float(F1.mean()),
        "f1_raw": float(F1_raw.mean()),
    }
    print(f"{pipe:9s}  F1 rescaled = {float(F1.mean()):.4f}   |  F1 raw = {float(F1_raw.mean()):.4f}")

print("\n=== BONUS THRESHOLDS ===")
g = out["graphrag"]
print(f"GraphRAG rescaled {g['f1_rescaled']:.4f}  vs  >=0.55  -> {'PASS' if g['f1_rescaled']>=0.55 else 'below'}")
print(f"GraphRAG raw      {g['f1_raw']:.4f}  vs  >=0.88  -> {'PASS' if g['f1_raw']>=0.88 else 'below'}")

# write canonical bertScore back into results
for i, r in enumerate(results):
    for pipe in ["graphrag", "basicRag", "llmOnly"]:
        cands = answers(pipe)
        # recompute per-item would be slow; store the avg marker + per-item below
# store aggregate
data.setdefault("aggregate", {})["bertScoreCanonical"] = {
    "graphrag": out["graphrag"], "basicRag": out["basicRag"], "llmOnly": out["llmOnly"],
    "method": "bert_score roberta-large rescale_with_baseline=True",
}
json.dump(data, open(RESULTS, "w", encoding="utf-8"), indent=2)
print(f"\nSaved canonical BERTScore aggregate to {RESULTS}")
