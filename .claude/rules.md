# Project Rules

These rules are mandatory for any agent working in this repository. They override
default behaviour and general habits. If a rule conflicts with something you were
about to do, the rule wins.

## 1. No unnecessary comments

Do not comment code that explains itself. Names, types, and structure are the
documentation. Only write a comment when the reader genuinely cannot infer the
"why" from the code, for example:

* Non obvious algorithms or math
* Workarounds for platform or library bugs (say which bug and why)
* Business rules that are not visible in the code
* Intentional deviations from an obvious approach

Never write comments that restate the next line, section banner comments, TODO
comments left behind as filler, or JSDoc that only repeats parameter names.

Bad:

```tsx
// set the loading state to true
setLoading(true);

// Button component
export function Button() {}
```

Good:

```tsx
// Android fires onLayout before insets settle, so defer one frame (RN 0.86)
requestAnimationFrame(measure);
```

## 2. No dashes in written text

In any prose you produce (chat replies, commit messages, PR descriptions, README
and docs content, user facing copy in the app, code comments) do not use em
dashes, en dashes, or triple dash separators. Rewrite the sentence with a comma,
a colon, a full stop, or parentheses instead.

This applies to written text only. Hyphens inside identifiers, file names, CLI
flags, kebab case component files, and package names are fine and expected.

## 3. No grid lines in UI backgrounds

Never add grid patterns, graph paper textures, dot grids, blueprint overlays, or
any repeating line pattern as a screen or card background. Backgrounds stay
solid, or use a subtle gradient or theme surface colour from
`src/constants/theme.ts`. Grid lines inside a chart plot area are the only
exception, and even then keep them minimal.

## 4. Production grade React Native

Treat every change as code that will be submitted to the Apple App Store and the
Google Play Store. Concretely:

* Handle loading, empty, and error states for anything async. Never leave a
  screen that can render blank or crash on a failed request.
* No unhandled promise rejections, no swallowed errors, no `console.log` left in
  committed code.
* Respect safe areas with `react-native-safe-area-context`. Do not hardcode
  notch, status bar, or home indicator sizes.
* Support both light and dark colour schemes through `use-color-scheme` and the
  theme constants. Never hardcode hex values inside components.
* Accessibility is required: `accessibilityLabel`, `accessibilityRole`, and
  `accessibilityState` on every interactive element, touch targets at least 44pt
  on iOS and 48dp on Android, and support for dynamic type where practical.
* Test both platforms in mind. When behaviour differs, use `Platform.select` or
  the `.ios.tsx` / `.android.tsx` / `.web.tsx` file conventions already used in
  `src/components`.
* Keep lists performant: `FlatList` or `FlashList` with stable `keyExtractor`,
  memoized row components, no `.map` over unbounded arrays inside a `ScrollView`.
* Never ship secrets, API keys, or tokens in the bundle or in `app.json`.
* No permission request without a clear in app reason and a matching usage
  description string, since store review rejects vague or unused permissions.
* TypeScript must be strict and clean. No `any`, no `@ts-ignore`, no unused
  exports. `npx tsc --noEmit` and `npm run lint` must pass before you call work
  done.
* Animations run through `react-native-reanimated` on the UI thread. No janky
  `setState` driven animation loops.

## 5. DRY, reusable components

Do not copy paste. If the same markup, style block, or logic appears a second
time, extract it before adding the third.

* Shared UI lives in `src/components`, primitives in `src/components/ui`.
* Shared logic lives in `src/hooks`, pure helpers in `src/utils`.
* Colours, spacing, radii, and typography come from `src/constants/theme.ts`.
  Add a token there rather than repeating a literal value across screens.
* Prefer composition and props over near duplicate components. If two components
  differ only by a colour or an icon, make it one component with a prop.
* Before writing a new component, search `src/components` for an existing one
  that already does the job or can be extended.

## 6. Expo version discipline

This project runs Expo SDK 57 and React Native 0.86. Read the exact versioned
docs at https://docs.expo.dev/versions/v57.0.0/ before writing any code that
touches an Expo module. Do not rely on remembered APIs from older SDKs.

## 7. Responsive on every mobile device

Every screen and component must lay out correctly on the full range of supported
devices, from the smallest phone (iPhone SE at 375 x 667 points) to the largest
(iPhone Pro Max, large Android handsets) and on tablets. A layout that only looks
right on the device you happened to preview is not done.

* Build with flex, percentages, `gap`, and `maxWidth`. Never position content by
  assuming a fixed screen height or width.
* Read live dimensions with `useWindowDimensions` when a value genuinely has to
  depend on screen size. Do not capture `Dimensions.get('window')` at module
  scope, since it does not survive rotation, split view, or foldables.
* Scale hero art, illustrations, and spacers from the available space, not from
  hardcoded point values tuned to one device.
* Any screen whose content can exceed the viewport must scroll. Wrap it in a
  `ScrollView` with `contentContainerStyle={{ flexGrow: 1 }}` so it still centres
  on tall screens and scrolls on short ones. Content must never be clipped or
  pushed under a fixed footer.
* Text must survive larger dynamic type and translated strings. Allow wrapping,
  and reach for `numberOfLines` with `adjustsFontSizeToFit` only where truncation
  is the intended design.
* Keep tap targets and safe area padding intact at every size. Small screens
  shrink spacing, never touch targets.
* Verify on at least a small device and a large device before calling a screen
  done. Prefer testing on the iPhone 12 simulator plus the iPhone SE (3rd
  generation) simulator, which is the smallest supported size.
