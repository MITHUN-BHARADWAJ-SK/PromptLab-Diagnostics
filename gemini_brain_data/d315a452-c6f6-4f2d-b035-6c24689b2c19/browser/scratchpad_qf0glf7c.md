# Task: Test the Deep Analyzer

## Plan
1. [x] Navigate to http://localhost:3000
2. [x] Complete onboarding modal (Deep Tester, deep@test.com, Student)
3. [x] Enter prompt in Analyzer: "could you maybe tell me about some stuff related to machine learning and give me various examples, I think it would be nice if you basically just do something with it or whatever"
4. [x] Select "OpenAI (GPT)" and click "Analyze"
5. [x] Wait for results
6. [x] Capture screenshots:
   - Overall score and dimension bars
   - Issues section
   - Suggestions section
7. [x] Extract data points:
   - Overall score: 1.5
   - Dimension scores: Clarity: 0, Constraints: 1, Model Alignment: 2, Ambiguity Risk: 3, Output Controllability: 2
   - Issues: 15 total (Clarity: 8, Constraints: 2, Model Alignment: 1, Ambiguity: 2, Control: 2)
   - Suggestions: 3 (all with rewrites)
   - Educational summary: "This prompt is too vague for reliable AI output..."
8. [x] Report findings to user
