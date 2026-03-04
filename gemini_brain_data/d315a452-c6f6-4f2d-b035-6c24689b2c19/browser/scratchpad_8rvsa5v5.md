# Task: Verify Interactive Expandable Blueprint Cards

## Checklist
- [x] Navigate to http://localhost:3000
- [x] Complete onboarding (if necessary)
- [x] Analyze "explain photosynthesis" with "OpenAI (GPT)"
- [x] Verify UI Changes:
    - [x] No emojis in section titles
    - [x] No "Intent Detection" card
    - [x] No separate "Issues Found" or "Suggestions" sections
    - [x] Expandable blueprint cards with chevrons
- [x] Interactive Verification:
    - [x] Expand a MISSING element card (check description, issues, suggestions)
    - [x] Expand a PRESENT element card (check description)
- [x] Capture Screenshots:
    - [x] Expanded card details
    - [x] Full blueprint section

## Observations
- User "Test" was already logged in but API failed with "User not found".
- Cleared localStorage and completed onboarding with Name="Test", Email="t@t.com", Role=Student.
- Analysis for "explain photosynthesis" completed successfully.
- "Prompt Blueprint" section title has no emoji.
- Intent Detection card is removed.
- Issues Found and Suggestions sections are removed.
- Each card in the blueprint is expandable.
- Expanded "Audience" and "Output Format" cards show relevant issues and suggestions inline.
- "Task Verb" (Strong) expanded card shows only the description.
- Chevrons (▼/▲) indicate expandability.
