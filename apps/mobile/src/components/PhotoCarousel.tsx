import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";

type Props = {
  photos: (string | undefined)[];
  width: number;
  height?: number;
  enableSwipe?: boolean;
  onIndexChange?: (i: number) => void;
};

export default function PhotoCarousel({
  photos,
  width,
  height,
  enableSwipe = false,
  onIndexChange,
}: Props) {
  const scrollRef = useRef<ScrollView>(null);
  const [index, setIndex] = useState(0);
  const slides = photos.length ? photos : [undefined];
  const H = height ?? Math.round(width * 0.9);

  // Only reset if the actual list of URIs changes
  const photosKey = useMemo(() => slides.join("|"), [slides]);

  useEffect(() => {
    setIndex(0);
    scrollRef.current?.scrollTo({ x: 0, animated: false });
  }, [photosKey]);

  const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.round(e.nativeEvent.contentOffset.x / width);
    if (i !== index) {
      setIndex(i);
      onIndexChange?.(i);
    }
  };

  const go = (to: number) => {
    const clamped = Math.max(0, Math.min(slides.length - 1, to));
    scrollRef.current?.scrollTo({ x: clamped * width, animated: true });
    setIndex(clamped);
    onIndexChange?.(clamped);
  };

  return (
    <View style={[styles.wrap, { height: H }]} renderToHardwareTextureAndroid>
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={handleScroll}
        scrollEventThrottle={16}
        scrollEnabled={enableSwipe}
        // removeClippedSubviews can cause momentary unload/reload during parent re-layers
        // removeClippedSubviews
        overScrollMode="never"
      >
        {slides.map((uri, i) => (
          <View key={uri ?? `ph-${i}`} style={{ width, height: H }} renderToHardwareTextureAndroid>
            {uri ? (
              <Image
                source={{ uri }}
                style={styles.photo}
                resizeMode="cover"
                fadeDuration={0}        // kill Android cross-fade
              />
            ) : (
              <View style={[styles.photo, styles.fallback]}>
                <Ionicons name="person-circle-outline" size={120} color="#ff4f81" />
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      {slides.length > 1 && (
        <>
          <View style={styles.dotsWrap}>
            <View style={styles.dots}>
              {slides.map((_, i) => (
                <View key={`dot-${i}`} style={[styles.dot, i === index && styles.dotActive]} />
              ))}
            </View>
          </View>

          <View style={styles.nav}>
            <TouchableOpacity style={styles.navBtn} onPress={() => go(index - 1)} disabled={index === 0}>
              <Ionicons name="chevron-back" size={22} color={index === 0 ? "#ccc" : "#fff"} />
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} onPress={() => go(index + 1)} disabled={index === slides.length - 1}>
              <Ionicons name="chevron-forward" size={22} color={index === slides.length - 1 ? "#ccc" : "#fff"} />
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { backgroundColor: "#f0f0f0", position: "relative" },
  photo: { width: "100%", height: "100%" },
  fallback: { alignItems: "center", justifyContent: "center", backgroundColor: "#ffeef5" },
  nav: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
  },
  navBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center", justifyContent: "center",
  },
  dotsWrap: {
    position: "absolute",
    top: 12,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dots: { flexDirection: "row", gap: 6, alignItems: "center", justifyContent: "center" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "rgba(255,255,255,0.65)" },
  dotActive: { backgroundColor: "#fff", width: 22 },
});
