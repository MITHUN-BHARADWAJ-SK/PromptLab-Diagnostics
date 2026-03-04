# PromptLab — Blueprint-Based Analyzer

## Architecture

```
User Prompt → Intent Extraction → Blueprint Lookup (model×task)
           → Structural Comparison → Mechanical Scoring → Scoped Suggestions
```

The analyzer **does not** compare prompts to "the best prompt ever." It compares them to a **model-specific reference structure** that defines what a high-quality prompt for that task typically contains.

---

## New/Modified Files

| File | Change |
|------|--------|
| [blueprints.js](file:///f:/PROMPTLAB/src/config/blueprints.js) | **[NEW]** 15 structural elements + model×task blueprints for OpenAI/Anthropic/Gemini |
| [analyzerService.js](file:///f:/PROMPTLAB/src/services/analyzerService.js) | **Rewritten** — 6-step blueprint engine |
| [promptController.js](file:///f:/PROMPTLAB/src/controllers/promptController.js) | Added intent/structural_comparison/tips to response |
| [app.js](file:///f:/PROMPTLAB/public/js/app.js) | New intent card, structural table, tips rendering |
| [index.css](file:///f:/PROMPTLAB/public/css/index.css) | Intent grid, tier/quality badges, table styles |

---

## Verified Test Results

### Test: Well-structured prompt → OpenAI

**Prompt**: *"Explain the concept of neural networks for a beginner audience in a numbered list format with examples, keeping it under 300 words"*

| Metric | Value |
|--------|-------|
| **Overall Score** | **4.0 / 5.0** |
| Clarity | 4 |
| Constraints | 3 |
| Model Alignment | 2 |
| Ambiguity Risk | 5 |
| Output Controllability | 5 |

**Intent correctly detected:**

![Intent detection showing Task=Explain, Subject=Neural Networks, Audience=Beginner](file:///C:/Users/ASUS/.gemini/antigravity/brain/d315a452-c6f6-4f2d-b035-6c24689b2c19/intent_detection_fix_verify_1772296422192.png)

**Structural comparison shows 5/5 required elements present:**

![Structural comparison table with Task Verb, Subject, Audience, Output Format, Scope all Strong/Present](file:///C:/Users/ASUS/.gemini/antigravity/brain/d315a452-c6f6-4f2d-b035-6c24689b2c19/structural_and_issues_1772296117432.png)

### Test: Weak prompt → OpenAI

**Prompt**: *"explain photosynthesis"* → Score: **2.4/5**, only Task Verb + Subject present, 3 missing required elements.

---

## End-to-End Recording

![Full test recording of the blueprint analyzer](file:///C:/Users/ASUS/.gemini/antigravity/brain/d315a452-c6f6-4f2d-b035-6c24689b2c19/subject_extraction_verify_1772296314374.webp)
