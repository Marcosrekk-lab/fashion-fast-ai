import React, { useRef } from "react";
import { StyleSheet, View, PanResponder, Dimensions } from "react-native";
import { Image } from "expo-image";
import { Ionicons } from "@expo/vector-icons";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import Colors from "@/constants/colors";

const c = Colors.dark;

interface CompareSliderProps {
  beforeUri: string;
  afterUri: string;
  height?: number;
}

export default function CompareSlider({
  beforeUri,
  afterUri,
  height = 300,
}: CompareSliderProps) {
  const containerWidth = Dimensions.get("window").width - 32;
  const sliderX = useSharedValue(containerWidth / 2);
  const isDragging = useRef(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        isDragging.current = true;
      },
      onPanResponderMove: (_, gestureState) => {
        const newX = Math.max(
          20,
          Math.min(containerWidth - 20, gestureState.moveX - 16),
        );
        sliderX.value = newX;
      },
      onPanResponderRelease: () => {
        isDragging.current = false;
      },
    }),
  ).current;

  const clipStyle = useAnimatedStyle(() => ({
    width: sliderX.value,
  }));

  const lineStyle = useAnimatedStyle(() => ({
    left: sliderX.value,
  }));

  const handleStyle = useAnimatedStyle(() => ({
    left: sliderX.value - 18,
  }));

  return (
    <View
      style={[styles.container, { height, width: containerWidth }]}
      {...panResponder.panHandlers}
    >
      <Image
        source={{ uri: afterUri }}
        style={[styles.image, { height }]}
        contentFit="cover"
      />

      <Animated.View style={[styles.beforeClip, clipStyle, { height }]}>
        <Image
          source={{ uri: beforeUri }}
          style={[styles.image, { width: containerWidth, height }]}
          contentFit="cover"
        />
      </Animated.View>

      <Animated.View style={[styles.sliderLine, lineStyle, { height }]}>
        <View style={styles.line} />
      </Animated.View>

      <Animated.View style={[styles.handle, handleStyle]}>
        <View style={styles.handleInner}>
          <Ionicons name="chevron-back" size={12} color={c.background} />
          <Ionicons name="chevron-forward" size={12} color={c.background} />
        </View>
      </Animated.View>

      <View style={styles.labelLeft}>
        <View style={styles.labelBg}>
          <Animated.Text style={styles.labelText}>Before</Animated.Text>
        </View>
      </View>
      <View style={styles.labelRight}>
        <View style={styles.labelBg}>
          <Animated.Text style={styles.labelText}>After</Animated.Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 14,
    overflow: "hidden",
    position: "relative",
    alignSelf: "center",
  },
  image: {
    width: "100%",
    position: "absolute",
    top: 0,
    left: 0,
  },
  beforeClip: {
    position: "absolute",
    top: 0,
    left: 0,
    overflow: "hidden",
  },
  sliderLine: {
    position: "absolute",
    top: 0,
    width: 2,
    zIndex: 10,
  },
  line: {
    flex: 1,
    width: 2,
    backgroundColor: "#fff",
  },
  handle: {
    position: "absolute",
    top: "50%",
    marginTop: -18,
    width: 36,
    height: 36,
    zIndex: 20,
  },
  handleInner: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: Colors.dark.accent,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#fff",
  },
  labelLeft: {
    position: "absolute",
    top: 10,
    left: 10,
    zIndex: 5,
  },
  labelRight: {
    position: "absolute",
    top: 10,
    right: 10,
    zIndex: 5,
  },
  labelBg: {
    backgroundColor: "rgba(0,0,0,0.55)",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  labelText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 11,
    color: "#fff",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
});
