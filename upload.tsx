import React, { useState, useRef, useCallback } from "react";
import {
  StyleSheet,
  Text,
  View,
  Pressable,
  Platform,
  ActivityIndicator,
  ScrollView,
  Alert,
  Dimensions,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import * as Clipboard from "expo-clipboard";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { fetch } from "expo/fetch";
import { router } from "expo-router";
import Colors from "@/constants/colors";
import { getApiKey, saveDraft } from "@/lib/storage";
import { getApiUrl } from "@/lib/query-client";
import { apiRequest } from "@/lib/query-client";
import CompareSlider from "@/components/CompareSlider";
import type { ListingDraft, ImageItem } from "@/lib/types";

const c = Colors.dark;
const SCREEN_WIDTH = Dimensions.get("window").width;
const MAX_IMAGES = 5;
const THUMB_SIZE = 72;

type Step = "capture" | "enhancing" | "review" | "analyzing" | "result";

export default function UploadScreen() {
  const insets = useSafeAreaInsets();
  const scrollRef = useRef<ScrollView>(null);

  const [step, setStep] = useState<Step>("capture");
  const [images, setImages] = useState<ImageItem[]>([]);
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [useEnhanced, setUseEnhanced] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<ListingDraft | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  const addImageFromResult = useCallback(
    async (uri: string, base64: string | null) => {
      const id = Crypto.randomUUID();
      const newItem: ImageItem = {
        id,
        originalUri: uri,
        originalBase64: base64,
        enhancedUri: null,
        enhancedBase64: null,
        enhancing: !!base64,
        enhanceFailed: false,
      };

      setImages((prev) => [...prev, newItem]);
      setSelectedIdx((prev) => (step === "capture" ? 0 : prev));
      setUseEnhanced((prev) => ({ ...prev, [id]: true }));
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (!base64) {
        setImages((prev) =>
          prev.map((img) =>
            img.id === id
              ? { ...img, enhancing: false, enhanceFailed: true }
              : img,
          ),
        );
        return;
      }

      try {
        const res = await apiRequest("POST", "/api/enhance", {
          imageBase64: base64,
        });
        const data = await res.json();
        if (data.enhancedBase64) {
          const convertedOriginalBase64 = data.convertedOriginal || base64;
          setImages((prev) =>
            prev.map((img) =>
              img.id === id
                ? {
                    ...img,
                    originalBase64: convertedOriginalBase64,
                    enhancedBase64: data.enhancedBase64,
                    enhancedUri: `data:image/jpeg;base64,${data.enhancedBase64}`,
                    enhancing: false,
                  }
                : img,
            ),
          );
        } else {
          throw new Error("No enhanced data");
        }
      } catch (err) {
        console.error("Enhance failed for image:", id, err);
        setImages((prev) =>
          prev.map((img) =>
            img.id === id
              ? { ...img, enhancing: false, enhanceFailed: true }
              : img,
          ),
        );
        setUseEnhanced((prev) => ({ ...prev, [id]: false }));
      }
    },
    [step],
  );

  const capturePhoto = async () => {
    if (images.length >= MAX_IMAGES) {
      Alert.alert("Limit Reached", `Maximum ${MAX_IMAGES} photos allowed.`);
      return;
    }
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        Alert.alert(
          "Camera Permission",
          "Camera access is needed to photograph your items.",
        );
        return;
      }
      const result = await ImagePicker.launchCameraAsync({
        quality: 0.8,
        base64: true,
      });
      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        await addImageFromResult(asset.uri, asset.base64 || null);
        if (step === "capture") setStep("review");
      }
    } catch (err) {
      console.error("Camera error:", err);
    }
  };

  const pickFromGallery = async () => {
    const remaining = MAX_IMAGES - images.length;
    if (remaining <= 0) {
      Alert.alert("Limit Reached", `Maximum ${MAX_IMAGES} photos allowed.`);
      return;
    }
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        quality: 0.8,
        base64: true,
        allowsMultipleSelection: true,
        selectionLimit: remaining,
      });
      if (!result.canceled && result.assets.length > 0) {
        for (const asset of result.assets) {
          await addImageFromResult(asset.uri, asset.base64 || null);
        }
        if (step === "capture") setStep("review");
      }
    } catch (err) {
      console.error("Gallery error:", err);
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
    setSelectedIdx((prev) => Math.max(0, prev - 1));
    setUseEnhanced((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const anyEnhancing = images.some((img) => img.enhancing);
  const selected = images[selectedIdx] || null;

  const proceedToAnalyze = async () => {
    if (images.length === 0) return;
    if (anyEnhancing) {
      Alert.alert(
        "Still Processing",
        "Some photos are still being enhanced. Please wait a moment.",
      );
      return;
    }

    const apiKey = await getApiKey();
    if (!apiKey) {
      setError("Please set your OpenAI API key in Settings first.");
      return;
    }

    setStep("analyzing");
    setError(null);
    setStreamingText("");
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const originalImages = images
        .map((img) => img.originalBase64)
        .filter(Boolean) as string[];

      if (originalImages.length === 0) {
        setError("No valid images to analyze.");
        setStep("review");
        return;
      }

      const baseUrl = getApiUrl();
      const url = new URL("/api/analyze-stream", baseUrl);

      const response = await fetch(url.toString(), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ images: originalImages, apiKey }),
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(errText || "Analysis failed");
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("Streaming not supported");
      }

      const decoder = new TextDecoder();
      let buffer = "";
      let finalResult: any = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.error) {
                throw new Error(data.error);
              }
              if (data.delta) {
                setStreamingText((prev) => prev + data.delta);
              }
              if (data.done && data.result) {
                finalResult = data.result;
              }
            } catch (parseErr: any) {
              if (parseErr.message && !parseErr.message.includes("JSON")) {
                throw parseErr;
              }
            }
          }
        }
      }

      if (!finalResult) {
        throw new Error("No result received from AI");
      }

      const primaryImg = images[0];
      const usePrimary = useEnhanced[primaryImg.id];
      const primaryUri =
        usePrimary && primaryImg.enhancedUri
          ? primaryImg.enhancedUri
          : primaryImg.originalUri;

      const allUris = images.map((img) => {
        const use = useEnhanced[img.id];
        return use && img.enhancedUri ? img.enhancedUri : img.originalUri;
      });

      const draft: ListingDraft = {
        id: Crypto.randomUUID(),
        imageUri: primaryUri,
        imageUris: allUris,
        brand: finalResult.brand || "Unknown",
        category: finalResult.category || "Clothing",
        title: finalResult.title || "Untitled",
        material: finalResult.material || "Unknown",
        condition: finalResult.condition || "Good",
        conditionScore: finalResult.conditionScore || finalResult.condition || "Good",
        flaws: finalResult.flaws || "No visible flaws detected",
        description: finalResult.description || "",
        sellProbability: finalResult.sellProbability || 50,
        quickSellPrice: finalResult.quickSellPrice || 5,
        maxProfitPrice: finalResult.maxProfitPrice || 10,
        suggestedPrice: finalResult.maxProfitPrice || 10,
        createdAt: Date.now(),
      };

      await saveDraft(draft);
      setResult(draft);
      setStep("result");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setTimeout(
        () => scrollRef.current?.scrollToEnd({ animated: true }),
        300,
      );
    } catch (err: any) {
      const msg = err?.message || "Analysis failed. Please try again.";
      setError(msg.includes(":") ? msg.split(": ").slice(1).join(": ") : msg);
      setStep("review");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  };

  const copyText = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== "web") {
      Alert.alert("Copied", `${label} copied to clipboard`);
    }
  };

  const resetAll = () => {
    setStep("capture");
    setImages([]);
    setSelectedIdx(0);
    setUseEnhanced({});
    setResult(null);
    setError(null);
    setStreamingText("");
  };

  const getProbabilityColor = (score: number) => {
    if (score >= 75) return c.success;
    if (score >= 45) return c.warning;
    return c.danger;
  };

  const stepLabels: Record<Step, string> = {
    capture: "Snap a Photo",
    enhancing: "Applying Studio Polish...",
    review: `Review ${images.length} Photo${images.length !== 1 ? "s" : ""}`,
    analyzing: "AI is Analyzing...",
    result: "Listing Ready",
  };

  const renderThumb = ({
    item,
    index,
  }: {
    item: ImageItem;
    index: number;
  }) => (
    <Pressable
      onPress={() => setSelectedIdx(index)}
      style={[
        styles.thumbWrap,
        selectedIdx === index && styles.thumbSelected,
      ]}
    >
      <Image
        source={{ uri: item.originalUri }}
        style={styles.thumbImage}
        contentFit="cover"
      />
      {item.enhancing && (
        <View style={styles.thumbSpinner}>
          <ActivityIndicator size="small" color={c.accent} />
        </View>
      )}
      {!item.enhancing && item.enhancedUri && (
        <View style={styles.thumbBadge}>
          <Ionicons name="sparkles" size={10} color={c.background} />
        </View>
      )}
      {step === "review" && (
        <Pressable
          style={styles.thumbRemove}
          onPress={() => removeImage(item.id)}
          hitSlop={8}
        >
          <Ionicons name="close-circle" size={18} color={c.danger} />
        </Pressable>
      )}
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View
        style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}
      >
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.headerTitle}>Analyze Item</Text>
            <Text style={styles.headerSubtitle}>{stepLabels[step]}</Text>
          </View>
          {step !== "capture" &&
            step !== "enhancing" &&
            step !== "analyzing" && (
              <Pressable onPress={resetAll} style={styles.resetBtn}>
                <Ionicons name="refresh" size={20} color={c.accent} />
              </Pressable>
            )}
        </View>
        <View style={styles.stepIndicator}>
          {["capture", "review", "result"].map((s, i) => (
            <View
              key={s}
              style={[
                styles.stepDot,
                (step === s ||
                  (step === "enhancing" && s === "capture") ||
                  (step === "analyzing" && s === "review") ||
                  (step === "result" && i < 3)) &&
                  styles.stepDotActive,
                step === s && styles.stepDotCurrent,
              ]}
            />
          ))}
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
        contentContainerStyle={[
          styles.content,
          { paddingBottom: insets.bottom + 100 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {step === "capture" && (
          <Animated.View entering={FadeIn.duration(300)}>
            <View style={styles.captureArea}>
              <View style={styles.cameraIconWrap}>
                <Ionicons name="camera" size={56} color={c.accent} />
              </View>
              <Text style={styles.captureTitle}>Photograph Your Item</Text>
              <Text style={styles.captureText}>
                Add up to 5 photos from different angles. We'll auto-enhance
                each photo for a professional look.
              </Text>

              <Pressable
                style={({ pressed }) => [
                  styles.cameraBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={capturePhoto}
                testID="take-photo-btn"
              >
                <Ionicons name="camera" size={22} color={c.background} />
                <Text style={styles.cameraBtnText}>Take Photo</Text>
              </Pressable>

              <Pressable
                style={({ pressed }) => [
                  styles.galleryBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={pickFromGallery}
              >
                <Ionicons name="images-outline" size={18} color={c.accent} />
                <Text style={styles.galleryBtnText}>
                  Or choose from gallery (up to 5)
                </Text>
              </Pressable>
            </View>
          </Animated.View>
        )}

        {step === "review" && (
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={styles.reviewContainer}
          >
            <View style={styles.thumbRow}>
              <FlatList
                data={images}
                keyExtractor={(item) => item.id}
                renderItem={renderThumb}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.thumbList}
              />
              {images.length < MAX_IMAGES && (
                <View style={styles.addBtnsRow}>
                  <Pressable
                    style={styles.addThumbBtn}
                    onPress={capturePhoto}
                  >
                    <Ionicons name="camera" size={20} color={c.accent} />
                  </Pressable>
                  <Pressable
                    style={styles.addThumbBtn}
                    onPress={pickFromGallery}
                  >
                    <Ionicons
                      name="images-outline"
                      size={20}
                      color={c.accent}
                    />
                  </Pressable>
                </View>
              )}
            </View>

            <Text style={styles.photoCounter}>
              {images.length}/{MAX_IMAGES} photos
            </Text>

            {selected && (
              <View style={styles.selectedPreview}>
                {selected.enhancing ? (
                  <View style={styles.enhancingWrap}>
                    <Image
                      source={{ uri: selected.originalUri }}
                      style={styles.previewImage}
                      contentFit="cover"
                    />
                    <View style={styles.enhancingOverlay}>
                      <ActivityIndicator size="large" color={c.accent} />
                      <Text style={styles.enhancingLabel}>
                        Enhancing Photo {selectedIdx + 1}...
                      </Text>
                    </View>
                  </View>
                ) : selected.enhancedUri ? (
                  <View style={styles.sliderSection}>
                    <Text style={styles.compareLabel}>
                      Photo {selectedIdx + 1} — Before & After
                    </Text>
                    <CompareSlider
                      beforeUri={selected.originalUri}
                      afterUri={selected.enhancedUri}
                      height={280}
                    />
                    <View style={styles.enhancementDetails}>
                      <Ionicons name="sparkles" size={14} color={c.accent} />
                      <Text style={styles.enhancementText}>
                        Brightness +12% · Contrast +18% · Sharpness enhanced
                      </Text>
                    </View>
                    <View style={styles.toggleRow}>
                      <Pressable
                        style={[
                          styles.toggleBtn,
                          !useEnhanced[selected.id] && styles.toggleBtnActive,
                        ]}
                        onPress={() => {
                          setUseEnhanced((prev) => ({
                            ...prev,
                            [selected.id]: false,
                          }));
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                        }}
                      >
                        <Ionicons
                          name={
                            !useEnhanced[selected.id]
                              ? "checkmark-circle"
                              : "ellipse-outline"
                          }
                          size={16}
                          color={
                            !useEnhanced[selected.id]
                              ? c.accent
                              : c.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.toggleText,
                            !useEnhanced[selected.id] &&
                              styles.toggleTextActive,
                          ]}
                        >
                          Original
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[
                          styles.toggleBtn,
                          useEnhanced[selected.id] && styles.toggleBtnActive,
                        ]}
                        onPress={() => {
                          setUseEnhanced((prev) => ({
                            ...prev,
                            [selected.id]: true,
                          }));
                          Haptics.impactAsync(
                            Haptics.ImpactFeedbackStyle.Light,
                          );
                        }}
                      >
                        <Ionicons
                          name={
                            useEnhanced[selected.id]
                              ? "checkmark-circle"
                              : "ellipse-outline"
                          }
                          size={16}
                          color={
                            useEnhanced[selected.id]
                              ? c.accent
                              : c.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.toggleText,
                            useEnhanced[selected.id] &&
                              styles.toggleTextActive,
                          ]}
                        >
                          Enhanced
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <View>
                    <Image
                      source={{ uri: selected.originalUri }}
                      style={styles.previewImage}
                      contentFit="cover"
                    />
                    {selected.enhanceFailed && (
                      <Text style={styles.noEnhanceText}>
                        Enhancement unavailable — using original
                      </Text>
                    )}
                  </View>
                )}
              </View>
            )}

            {error && (
              <View style={styles.errorContainer}>
                <Ionicons name="alert-circle" size={24} color={c.danger} />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}

            <Pressable
              style={({ pressed }) => [
                styles.analyzeBtn,
                anyEnhancing && styles.analyzeBtnDisabled,
                pressed && !anyEnhancing && styles.btnPressed,
              ]}
              onPress={proceedToAnalyze}
              disabled={anyEnhancing}
            >
              {anyEnhancing ? (
                <>
                  <ActivityIndicator size="small" color={c.background} />
                  <Text style={styles.analyzeBtnText}>
                    Enhancing Photos...
                  </Text>
                </>
              ) : (
                <>
                  <Ionicons name="flash" size={20} color={c.background} />
                  <Text style={styles.analyzeBtnText}>
                    Generate AI Listing
                    {images.length > 1
                      ? ` (${images.length} photos)`
                      : ""}
                  </Text>
                </>
              )}
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.retakeBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={resetAll}
            >
              <Ionicons
                name="camera-reverse-outline"
                size={18}
                color={c.textSecondary}
              />
              <Text style={styles.retakeBtnText}>Start Over</Text>
            </Pressable>
          </Animated.View>
        )}

        {step === "analyzing" && (
          <View style={styles.analyzingArea}>
            <View style={styles.analyzingThumbRow}>
              {images.map((img) => (
                <View key={img.id} style={styles.analyzingThumb}>
                  <Image
                    source={{ uri: img.originalUri }}
                    style={styles.analyzingThumbImg}
                    contentFit="cover"
                  />
                  <View style={styles.analyzingThumbOverlay}>
                    <ActivityIndicator size="small" color={c.accent} />
                  </View>
                </View>
              ))}
            </View>
            <Text style={styles.analyzingTitle}>AI Analyzing Clothing</Text>
            <Text style={styles.analyzingSubtext}>
              {images.length > 1
                ? `Comparing ${images.length} photos for best results`
                : "Scanning for brand, flaws & condition"}
            </Text>

            {streamingText.length > 0 && (
              <View style={styles.streamingBox}>
                <View style={styles.streamingHeader}>
                  <ActivityIndicator size="small" color={c.accent} />
                  <Text style={styles.streamingHeaderText}>
                    AI writing listing...
                  </Text>
                </View>
                <Text style={styles.streamingContent}>
                  {streamingText.slice(-400)}
                </Text>
              </View>
            )}

            {streamingText.length === 0 && (
              <View style={styles.analyzingSteps}>
                {[
                  "Detecting brand & logos",
                  "Scanning for flaws & wear",
                  "Assessing Vinted condition",
                  "Writing top-seller description",
                  "Calculating UK market price",
                ].map((label, i) => (
                  <View key={label} style={styles.analyzingStep}>
                    <ActivityIndicator
                      size="small"
                      color={c.accent}
                      style={{ opacity: 0.6 + i * 0.08 }}
                    />
                    <Text style={styles.analyzingStepText}>{label}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        {step === "result" && result && (
          <Animated.View
            entering={FadeInDown.duration(400)}
            style={styles.resultContainer}
          >
            {result.imageUris && result.imageUris.length > 1 ? (
              <FlatList
                data={result.imageUris}
                keyExtractor={(_, i) => String(i)}
                horizontal
                showsHorizontalScrollIndicator={false}
                renderItem={({ item: uri }) => (
                  <View style={styles.resultThumbWrap}>
                    <Image
                      source={{ uri }}
                      style={styles.resultThumbImg}
                      contentFit="cover"
                    />
                  </View>
                )}
                contentContainerStyle={styles.resultThumbRow}
              />
            ) : (
              <View style={styles.resultImageWrap}>
                <Image
                  source={{ uri: result.imageUri }}
                  style={styles.resultImage}
                  contentFit="cover"
                />
              </View>
            )}

            <View style={styles.statsRow}>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Sell Probability</Text>
                <Text
                  style={[
                    styles.statValue,
                    {
                      color: getProbabilityColor(result.sellProbability),
                    },
                  ]}
                >
                  {result.sellProbability}%
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Quick Sell</Text>
                <Text style={[styles.statValue, { color: c.warning }]}>
                  £{result.quickSellPrice}
                </Text>
              </View>
              <View style={styles.statCard}>
                <Text style={styles.statLabel}>Max Profit</Text>
                <Text style={[styles.statValue, { color: c.accent }]}>
                  £{result.maxProfitPrice}
                </Text>
              </View>
            </View>

            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Brand</Text>
                <Text style={styles.detailValue}>{result.brand}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Category</Text>
                <Text style={styles.detailValue}>{result.category}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Material</Text>
                <Text style={styles.detailValue}>{result.material}</Text>
              </View>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Condition</Text>
                <Text style={styles.detailValue}>{result.conditionScore}</Text>
              </View>
            </View>

            {result.flaws && result.flaws !== "No visible flaws detected" && (
              <View style={styles.flawsCard}>
                <View style={styles.flawsHeader}>
                  <Ionicons name="warning" size={16} color={c.warning} />
                  <Text style={styles.flawsTitle}>Flaws Detected</Text>
                </View>
                <Text style={styles.flawsText}>{result.flaws}</Text>
              </View>
            )}

            {result.flaws === "No visible flaws detected" && (
              <View style={styles.noFlawsCard}>
                <Ionicons name="checkmark-circle" size={16} color={c.success} />
                <Text style={styles.noFlawsText}>No visible flaws detected</Text>
              </View>
            )}

            <View style={styles.copySection}>
              <View style={styles.copyBlock}>
                <Text style={styles.copyLabel}>Title</Text>
                <Text style={styles.copyContent} numberOfLines={2}>
                  {result.title}
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.copyBtn,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={() => copyText(result.title, "Title")}
                >
                  <Ionicons name="copy-outline" size={16} color={c.accent} />
                  <Text style={styles.copyBtnText}>Copy Title</Text>
                </Pressable>
              </View>

              <View style={styles.copyBlock}>
                <Text style={styles.copyLabel}>Description</Text>
                <Text style={styles.copyContent}>{result.description}</Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.copyBtn,
                    pressed && styles.btnPressed,
                  ]}
                  onPress={() =>
                    copyText(result.description, "Description")
                  }
                >
                  <Ionicons name="copy-outline" size={16} color={c.accent} />
                  <Text style={styles.copyBtnText}>Copy Description</Text>
                </Pressable>
              </View>
            </View>

            <View style={styles.actionRow}>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  pressed && styles.btnPressed,
                ]}
                onPress={() =>
                  router.push({
                    pathname: "/draft/[id]",
                    params: { id: result.id },
                  })
                }
              >
                <Ionicons name="open-outline" size={18} color={c.accent} />
                <Text style={styles.actionBtnText}>View Full Draft</Text>
              </Pressable>
              <Pressable
                style={({ pressed }) => [
                  styles.actionBtn,
                  styles.actionBtnPrimary,
                  pressed && styles.btnPressed,
                ]}
                onPress={resetAll}
              >
                <Ionicons name="add" size={18} color={c.background} />
                <Text style={styles.actionBtnTextPrimary}>New Item</Text>
              </Pressable>
            </View>
          </Animated.View>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: c.background },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: c.card,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitle: {
    fontSize: 28,
    fontFamily: "Inter_700Bold",
    color: c.text,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.textSecondary,
    marginTop: 4,
  },
  resetBtn: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  stepIndicator: { flexDirection: "row", gap: 6, marginTop: 12 },
  stepDot: {
    flex: 1,
    height: 3,
    borderRadius: 2,
    backgroundColor: c.border,
  },
  stepDotActive: { backgroundColor: c.accent + "50" },
  stepDotCurrent: { backgroundColor: c.accent },
  content: { padding: 16, gap: 16 },
  btnPressed: { opacity: 0.8, transform: [{ scale: 0.97 }] },

  captureArea: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 48,
    backgroundColor: c.card,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: c.border,
    borderStyle: "dashed",
    gap: 16,
    paddingHorizontal: 32,
  },
  cameraIconWrap: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: c.accent + "12",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 4,
  },
  captureTitle: {
    fontSize: 20,
    fontFamily: "Inter_700Bold",
    color: c.text,
    textAlign: "center",
  },
  captureText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  cameraBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: c.accent,
    paddingVertical: 16,
    paddingHorizontal: 40,
    borderRadius: 14,
    width: "100%",
    marginTop: 4,
  },
  cameraBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 17,
    color: c.background,
  },
  galleryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
  },
  galleryBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: c.accent,
  },

  reviewContainer: { gap: 16 },
  thumbRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  thumbList: { gap: 8 },
  thumbWrap: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 2,
    borderColor: c.border,
    position: "relative",
  },
  thumbSelected: { borderColor: c.accent },
  thumbImage: { width: "100%", height: "100%" },
  thumbSpinner: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  thumbBadge: {
    position: "absolute",
    bottom: 3,
    right: 3,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: c.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  thumbRemove: { position: "absolute", top: -2, right: -2 },
  addBtnsRow: { gap: 6 },
  addThumbBtn: {
    width: THUMB_SIZE / 2 - 2,
    height: THUMB_SIZE / 2 - 2,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: c.accent + "40",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: c.card,
  },
  photoCounter: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
    color: c.textSecondary,
    textAlign: "center",
  },
  selectedPreview: {},
  enhancingWrap: { borderRadius: 16, overflow: "hidden" },
  previewImage: { width: "100%", height: 280, borderRadius: 16 },
  enhancingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 16,
  },
  enhancingLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: "#fff",
  },
  sliderSection: { gap: 12 },
  compareLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 15,
    color: c.text,
  },
  enhancementDetails: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.accent + "10",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: c.accent + "20",
  },
  enhancementText: {
    fontFamily: "Inter_400Regular",
    fontSize: 11,
    color: c.accent,
  },
  toggleRow: { flexDirection: "row", gap: 10 },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  toggleBtnActive: {
    backgroundColor: c.accent + "12",
    borderColor: c.accent + "40",
  },
  toggleText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: c.textSecondary,
  },
  toggleTextActive: { color: c.accent },
  noEnhanceText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.textSecondary,
    textAlign: "center",
    marginTop: 8,
  },

  errorContainer: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
    backgroundColor: c.danger + "15",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: c.danger + "30",
    paddingHorizontal: 20,
  },
  errorText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: c.danger,
    textAlign: "center",
  },
  analyzeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    backgroundColor: c.accent,
    paddingVertical: 16,
    borderRadius: 14,
  },
  analyzeBtnDisabled: { opacity: 0.6 },
  analyzeBtnText: {
    fontFamily: "Inter_700Bold",
    fontSize: 16,
    color: c.background,
  },
  retakeBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  retakeBtnText: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: c.textSecondary,
  },

  analyzingArea: { alignItems: "center", gap: 16 },
  analyzingThumbRow: {
    flexDirection: "row",
    justifyContent: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  analyzingThumb: {
    width: 72,
    height: 72,
    borderRadius: 12,
    overflow: "hidden",
  },
  analyzingThumbImg: { width: "100%", height: "100%" },
  analyzingThumbOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(22,22,43,0.5)",
    alignItems: "center",
    justifyContent: "center",
  },
  analyzingTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 18,
    color: c.text,
  },
  analyzingSubtext: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: c.textSecondary,
    textAlign: "center",
  },
  analyzingSteps: {
    alignSelf: "stretch",
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    gap: 14,
    borderWidth: 1,
    borderColor: c.border,
  },
  analyzingStep: { flexDirection: "row", alignItems: "center", gap: 12 },
  analyzingStepText: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: c.textSecondary,
  },
  streamingBox: {
    alignSelf: "stretch",
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: c.accent + "30",
  },
  streamingHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  streamingHeaderText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: c.accent,
  },
  streamingContent: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: c.textSecondary,
    lineHeight: 18,
  },

  resultContainer: { gap: 16 },
  resultImageWrap: { borderRadius: 16, overflow: "hidden" },
  resultImage: { width: "100%", height: 260 },
  resultThumbRow: { gap: 10, paddingHorizontal: 2 },
  resultThumbWrap: {
    width: 160,
    height: 200,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
  resultThumbImg: { width: "100%", height: "100%" },
  statsRow: { flexDirection: "row", gap: 8 },
  statCard: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 12,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  statLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 10,
    color: c.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: { fontFamily: "Inter_700Bold", fontSize: 24 },
  detailCard: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: c.border,
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
  },
  detailLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 14,
    color: c.textSecondary,
  },
  detailValue: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.text,
    maxWidth: "60%",
    textAlign: "right",
  },
  divider: { height: 1, backgroundColor: c.border },
  flawsCard: {
    backgroundColor: c.warning + "12",
    borderRadius: 14,
    padding: 16,
    gap: 8,
    borderWidth: 1,
    borderColor: c.warning + "30",
  },
  flawsHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  flawsTitle: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.warning,
  },
  flawsText: {
    fontFamily: "Inter_400Regular",
    fontSize: 13,
    color: c.text,
    lineHeight: 20,
  },
  noFlawsCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: c.success + "12",
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: c.success + "30",
  },
  noFlawsText: {
    fontFamily: "Inter_500Medium",
    fontSize: 13,
    color: c.success,
  },
  copySection: { gap: 12 },
  copyBlock: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    gap: 10,
    borderWidth: 1,
    borderColor: c.border,
  },
  copyLabel: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: c.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  copyContent: {
    fontFamily: "Inter_400Regular",
    fontSize: 14,
    color: c.text,
    lineHeight: 20,
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-end",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: c.accent + "15",
  },
  copyBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 13,
    color: c.accent,
  },
  actionRow: { flexDirection: "row", gap: 12 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: c.card,
    borderWidth: 1,
    borderColor: c.border,
  },
  actionBtnPrimary: { backgroundColor: c.accent, borderColor: c.accent },
  actionBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.accent,
  },
  actionBtnTextPrimary: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.background,
  },
});
