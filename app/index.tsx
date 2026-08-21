import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// ============================================================
// FIGMA SVG IMPORTS
// ============================================================

import LaunchSVG from '../assets/launch/launch.svg';

import Onboarding1SVG from '../assets/onboarding/onboarding-1.svg';
import Onboarding2SVG from '../assets/onboarding/onboarding-2.svg';
import Onboarding3SVG from '../assets/onboarding/onboarding-3.svg';


// ============================================================
// FIGMA REFERENCE FRAME
// ============================================================
//
// All exported Figma screens are based on:
//
// Width  = 393px
// Height = 852px
//
// We preserve this coordinate system and scale it
// proportionally on different device widths.
//

const FIGMA_WIDTH = 393;
const FIGMA_HEIGHT = 852;


// ============================================================
// ONBOARDING BUTTON SPECIFICATION
// ============================================================
//
// Extracted from the Figma onboarding SVG:
//
// x       = 16.5
// y       = 762.5
// width   = 360
// height  = 45
// radius  = 20.5
//
// Colors:
//
// Fill   = #1E56A0
// Stroke = #5381BB
//
// The original SVG already contains the visual button.
// The native button below sits directly on top of it so
// that Continue / Get Started remains interactive.
//

const BUTTON_X = 16.5;
const BUTTON_Y = 762.5;
const BUTTON_WIDTH = 360;
const BUTTON_HEIGHT = 45;
const BUTTON_RADIUS = 20.5;

const BUTTON_COLOR = '#1E56A0';
const BUTTON_BORDER_COLOR = '#5381BB';


// ============================================================
// SKIP INTERACTION AREA
// ============================================================
//
// IMPORTANT:
//
// The visible Skip text is already part of the exported
// Figma SVG.
//
// We DO NOT render another "Skip" Text component.
//
// Instead, we place a transparent Pressable over the
// existing Skip artwork.
//
// These coordinates refer to the 393 x 852 Figma frame.
//
// If the Skip artwork needs a tiny positional adjustment,
// ONLY change these four values.
//
// Do NOT change the SVG itself.
//

const SKIP_X = 300;
const SKIP_Y = 50;
const SKIP_WIDTH = 55;
const SKIP_HEIGHT = 38;


// ============================================================
// SCREEN TYPES
// ============================================================

type Screen = 'launch' | 'onboarding' | 'main';


// ============================================================
// HOME SCREEN
// ============================================================

export default function HomeScreen() {
  const { width, height } = useWindowDimensions();

  const [screen, setScreen] = useState<Screen>('launch');
  const [onboardingIndex, setOnboardingIndex] = useState(0);

  // Prevent accidental double navigation.
  const navigatingRef = useRef(false);


  // ==========================================================
  // RESPONSIVE SCALING
  // ==========================================================

  const scale = width / FIGMA_WIDTH;

  const scaledHeight = FIGMA_HEIGHT * scale;


  // ==========================================================
  // LAUNCH ANIMATION
  // ==========================================================

  const launchOpacity = useRef(
    new Animated.Value(1)
  ).current;


  // ==========================================================
  // BUTTON ANIMATION
  // ==========================================================

  const buttonScale = useRef(
    new Animated.Value(1)
  ).current;

  const buttonOpacity = useRef(
    new Animated.Value(1)
  ).current;


  // ==========================================================
  // LAUNCH SCREEN
  // ==========================================================
  //
  // Figma interaction:
  //
  // After Delay
  // Delay = 3500ms
  // Navigate to Onboarding
  // Animation = Dissolve
  // Easing = Ease Out
  // Duration = 300ms
  //

  useEffect(() => {
    if (screen !== 'launch') {
      return;
    }

    const timer = setTimeout(() => {
      Animated.timing(launchOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        setScreen('onboarding');

        launchOpacity.setValue(0);

        Animated.timing(launchOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }).start();
      });
    }, 3500);

    return () => clearTimeout(timer);
  }, [screen, launchOpacity]);


  // ==========================================================
  // NEXT SCREEN
  // ==========================================================

  const next = () => {
    if (navigatingRef.current) {
      return;
    }

    navigatingRef.current = true;

    // Small delay allows the button release animation
    // to begin before the screen changes.

    setTimeout(() => {
      if (onboardingIndex < 2) {
        setOnboardingIndex((current) => current + 1);
      } else {
        setScreen('main');
      }

      navigatingRef.current = false;
    }, 120);
  };


  // ==========================================================
  // PREVIOUS SCREEN
  // ==========================================================

  const previous = () => {
    if (onboardingIndex > 0) {
      setOnboardingIndex((current) => current - 1);
    }
  };


  // ==========================================================
  // SKIP
  // ==========================================================
  //
  // The visible Skip text is part of the Figma SVG.
  //
  // This function is triggered by the transparent Pressable
  // positioned over that SVG artwork.
  //

  const skip = () => {
    if (navigatingRef.current) {
      return;
    }

    navigatingRef.current = true;

    setScreen('main');

    setTimeout(() => {
      navigatingRef.current = false;
    }, 150);
  };


  // ==========================================================
  // BUTTON PRESS IN
  // ==========================================================

  const handleButtonPressIn = () => {
    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: 0.96,
        friction: 6,
        tension: 180,
        useNativeDriver: true,
      }),

      Animated.timing(buttonOpacity, {
        toValue: 0.82,
        duration: 80,
        useNativeDriver: true,
      }),
    ]).start();
  };


  // ==========================================================
  // BUTTON PRESS OUT
  // ==========================================================

  const handleButtonPressOut = () => {
    Animated.parallel([
      Animated.spring(buttonScale, {
        toValue: 1,
        friction: 5,
        tension: 180,
        useNativeDriver: true,
      }),

      Animated.timing(buttonOpacity, {
        toValue: 1,
        duration: 100,
        useNativeDriver: true,
      }),
    ]).start();
  };


  // ==========================================================
  // SWIPE NAVIGATION
  // ==========================================================

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return (
          Math.abs(gestureState.dx) > 12 &&
          Math.abs(gestureState.dx) >
            Math.abs(gestureState.dy)
        );
      },

      onPanResponderRelease: (_, gestureState) => {
        const SWIPE_THRESHOLD = 55;

        // ----------------------------------------------------
        // SWIPE LEFT
        // ----------------------------------------------------

        if (
          gestureState.dx < -SWIPE_THRESHOLD &&
          onboardingIndex < 2
        ) {
          next();
          return;
        }

        // ----------------------------------------------------
        // SWIPE RIGHT
        // ----------------------------------------------------

        if (
          gestureState.dx > SWIPE_THRESHOLD &&
          onboardingIndex > 0
        ) {
          previous();
        }
      },
    })
  ).current;


  // ==========================================================
  // LAUNCH SCREEN
  // ==========================================================

  if (screen === 'launch') {
    return (
      <View style={styles.fullScreen}>
        <StatusBar hidden />

        <Animated.View
          style={[
            styles.svgFrame,
            {
              width,
              height: Math.max(
                height,
                scaledHeight
              ),
              opacity: launchOpacity,
            },
          ]}
        >
          <LaunchSVG
            width={width}
            height={scaledHeight}
          />
        </Animated.View>
      </View>
    );
  }


  // ==========================================================
  // TEMPORARY MAIN APPLICATION SCREEN
  // ==========================================================

  if (screen === 'main') {
    return (
      <View style={styles.mainScreen}>
        <StatusBar style="dark" />

        <View style={styles.mainContent} />
      </View>
    );
  }


  // ==========================================================
  // RENDER CURRENT ONBOARDING SVG
  // ==========================================================
  //
  // We intentionally render each SVG explicitly.
  //
  // This avoids the previous React Native SVG component
  // resolution problem caused by dynamically rendering
  // an imported SVG component.
  //

  const renderOnboardingSVG = () => {
    if (onboardingIndex === 0) {
      return (
        <Onboarding1SVG
          width={width}
          height={scaledHeight}
        />
      );
    }

    if (onboardingIndex === 1) {
      return (
        <Onboarding2SVG
          width={width}
          height={scaledHeight}
        />
      );
    }

    return (
      <Onboarding3SVG
        width={width}
        height={scaledHeight}
      />
    );
  };


  // ==========================================================
  // BUTTON LABEL
  // ==========================================================

  const buttonLabel =
    onboardingIndex === 2
      ? 'Get Started'
      : 'Continue';


  // ==========================================================
  // ONBOARDING SCREEN
  // ==========================================================

  return (
    <View
      style={styles.fullScreen}
      {...panResponder.panHandlers}
    >
      <StatusBar hidden />

      <View
        style={[
          styles.svgFrame,
          {
            width,
            height: scaledHeight,
          },
        ]}
      >

        {/* ==================================================
            COMPLETE FIGMA ONBOARDING FRAME
            ==================================================

            This SVG already contains:

            • Settings icon
            • Skip artwork
            • Illustration
            • Title
            • Description
            • Page indicators
            • Original Figma button

            We keep all of it visually untouched.
            ================================================== */}

        {renderOnboardingSVG()}


        {/* ==================================================
            SKIP INTERACTION OVERLAY
            ==================================================

            IMPORTANT:

            The visible "Skip" text comes from the SVG.

            This Pressable is completely transparent.

            It exists ONLY to make the existing Figma
            Skip artwork clickable.

            It does NOT render another Skip text.

            Therefore:

            SVG Skip = visual
            Pressable = interaction
            ================================================== */}

        <Pressable
          onPress={skip}
          hitSlop={10}
          style={[
            styles.skipTouchArea,
            {
              left: SKIP_X * scale,
              top: SKIP_Y * scale,
              width: SKIP_WIDTH * scale,
              height: SKIP_HEIGHT * scale,
            },
          ]}
        />


        {/* ==================================================
            NATIVE INTERACTIVE BUTTON
            ==================================================

            The original Figma button remains underneath.

            This native button sits exactly on top of it.

            Its purpose is interaction and animation.

            Visual geometry matches the Figma SVG.
            ================================================== */}

        <Animated.View
          style={[
            styles.nativeButtonWrapper,
            {
              left: BUTTON_X * scale,
              top: BUTTON_Y * scale,
              width: BUTTON_WIDTH * scale,
              height: BUTTON_HEIGHT * scale,

              transform: [
                {
                  scale: buttonScale,
                },
              ],

              opacity: buttonOpacity,
            },
          ]}
        >
          <Pressable
            onPress={next}
            onPressIn={handleButtonPressIn}
            onPressOut={handleButtonPressOut}
            android_ripple={{
              color: 'rgba(255,255,255,0.16)',
              borderless: false,
            }}
            style={styles.nativeButton}
          >
            <Text
              style={[
                styles.nativeButtonText,
                {
                  fontSize: 14 * scale,
                },
              ]}
            >
              {buttonLabel}
            </Text>
          </Pressable>
        </Animated.View>

      </View>
    </View>
  );
}


// ============================================================
// STYLES
// ============================================================

const styles = StyleSheet.create({

  // ==========================================================
  // FULL SCREEN
  // ==========================================================

  fullScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },


  // ==========================================================
  // FIGMA SVG FRAME
  // ==========================================================

  svgFrame: {
    position: 'relative',
    overflow: 'hidden',
  },


  // ==========================================================
  // SKIP TOUCH AREA
  // ==========================================================
  //
  // Completely transparent.
  //
  // The SVG itself supplies the visible Skip artwork.
  //

  skipTouchArea: {
    position: 'absolute',
    backgroundColor: 'transparent',
    zIndex: 20,
  },


  // ==========================================================
  // NATIVE BUTTON WRAPPER
  // ==========================================================

  nativeButtonWrapper: {
    position: 'absolute',
    zIndex: 30,
  },


  // ==========================================================
  // NATIVE BUTTON
  // ==========================================================

  nativeButton: {
    flex: 1,

    backgroundColor: BUTTON_COLOR,

    borderWidth: 1,
    borderColor: BUTTON_BORDER_COLOR,

    borderRadius: BUTTON_RADIUS,

    alignItems: 'center',
    justifyContent: 'center',

    overflow: 'hidden',
  },


  // ==========================================================
  // BUTTON TEXT
  // ==========================================================

  nativeButtonText: {
    color: '#FFFFFF',
    fontWeight: '600',
    textAlign: 'center',
  },


  // ==========================================================
  // TEMPORARY MAIN SCREEN
  // ==========================================================

  mainScreen: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  mainContent: {
    flex: 1,
  },

});