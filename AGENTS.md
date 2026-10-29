# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.

# Nexora UI rules

- Anything Nexora does that takes a while (web searches, market research, insights, quotes, exports, learning, file or
  "Tell Nexora" processing) must show the animated "NEXORA is working" screen from the Figma "Add Knowledge" design:
  wrap the call in `nexoraBusy({ heading, title, steps, detail }, () => ...)` in app/index.tsx
  (knowledge uploads use the `AnalyzingSteps` view on the Add Knowledge screen).
