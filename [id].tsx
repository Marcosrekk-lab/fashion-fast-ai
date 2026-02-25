import React, { useState, useEffect } from "react";
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import Colors from "@/constants/colors";
import { getDraft, deleteDraft } from "@/lib/storage";
import type { ListingDraft } from "@/lib/types";

const c = Colors.dark;

export default function DraftDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState<ListingDraft | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (id) {
        const data = await getDraft(id);
        setDraft(data);
      }
      setLoading(false);
    })();
  }, [id]);

  const copyText = async (text: string, label: string) => {
    await Clipboard.setStringAsync(text);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (Platform.OS !== "web") {
      Alert.alert("Copied", `${label} copied to clipboard`);
    }
  };

  const handleDelete = () => {
    const doDelete = async () => {
      if (id) {
        await deleteDraft(id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        router.back();
      }
    };

    if (Platform.OS === "web") {
      if (confirm("Delete this draft?")) doDelete();
    } else {
      Alert.alert("Delete Draft", "This action cannot be undone.", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const getProbabilityColor = (score: number) => {
    if (score >= 75) return c.success;
    if (score >= 45) return c.warning;
    return c.danger;
  };

  const getProbabilityLabel = (score: number) => {
    if (score >= 75) return "High Demand";
    if (score >= 45) return "Moderate";
    return "Low Demand";
  };

  if (loading) {
    return (
      <View style={[styles.container, styles.center]}>
        <ActivityIndicator size="large" color={c.accent} />
      </View>
    );
  }

  if (!draft) {
    return (
      <View style={[styles.container, styles.center]}>
        <Ionicons name="alert-circle-outline" size={48} color={c.textSecondary} />
        <Text style={styles.errorMsg}>Draft not found</Text>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.backLink}>Go Back</Text>
        </Pressable>
      </View>
    );
  }

  const dateStr = new Date(draft.createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: insets.bottom + 30 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Image
          source={{ uri: draft.imageUri }}
          style={styles.heroImage}
          contentFit="cover"
        />

        <View style={styles.brandRow}>
          <Text style={styles.brand}>{draft.brand}</Text>
          <Text style={styles.date}>{dateStr}</Text>
        </View>
        <Text style={styles.title}>{draft.title}</Text>

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Sell Probability</Text>
            <Text
              style={[
                styles.statValue,
                { color: getProbabilityColor(draft.sellProbability) },
              ]}
            >
              {draft.sellProbability}%
            </Text>
            <Text
              style={[
                styles.statSub,
                { color: getProbabilityColor(draft.sellProbability) },
              ]}
            >
              {getProbabilityLabel(draft.sellProbability)}
            </Text>
          </View>
          <View style={styles.statCard}>
            <Text style={styles.statLabel}>Suggested Price</Text>
            <Text style={[styles.statValue, { color: c.accent }]}>
              ${draft.suggestedPrice}
            </Text>
            <Text style={[styles.statSub, { color: c.accentDim }]}>
              Estimated
            </Text>
          </View>
        </View>

        <View style={styles.detailCard}>
          <Text style={styles.cardHeader}>Item Details</Text>
          {[
            { label: "Category", value: draft.category },
            { label: "Material", value: draft.material },
            { label: "Condition", value: draft.condition },
          ].map((item, i) => (
            <React.Fragment key={item.label}>
              {i > 0 && <View style={styles.divider} />}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>{item.label}</Text>
                <Text style={styles.detailValue}>{item.value}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        <View style={styles.copyCard}>
          <View style={styles.copyHeader}>
            <Text style={styles.cardHeader}>Listing Title</Text>
            <Pressable
              style={({ pressed }) => [
                styles.copyBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={() => copyText(draft.title, "Title")}
            >
              <Ionicons name="copy-outline" size={16} color={c.accent} />
              <Text style={styles.copyBtnText}>Copy</Text>
            </Pressable>
          </View>
          <Text style={styles.contentText}>{draft.title}</Text>
        </View>

        <View style={styles.copyCard}>
          <View style={styles.copyHeader}>
            <Text style={styles.cardHeader}>SEO Description</Text>
            <Pressable
              style={({ pressed }) => [
                styles.copyBtn,
                pressed && styles.btnPressed,
              ]}
              onPress={() => copyText(draft.description, "Description")}
            >
              <Ionicons name="copy-outline" size={16} color={c.accent} />
              <Text style={styles.copyBtnText}>Copy</Text>
            </Pressable>
          </View>
          <Text style={styles.contentText}>{draft.description}</Text>
        </View>

        <Pressable
          style={({ pressed }) => [
            styles.deleteBtn,
            pressed && styles.btnPressed,
          ]}
          onPress={handleDelete}
        >
          <Ionicons name="trash-outline" size={18} color={c.danger} />
          <Text style={styles.deleteBtnText}>Delete Draft</Text>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  center: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  errorMsg: {
    fontFamily: "Inter_500Medium",
    fontSize: 16,
    color: c.textSecondary,
  },
  backLink: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.accent,
  },
  scrollContent: {
    gap: 16,
  },
  heroImage: {
    width: "100%",
    height: 320,
  },
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  brand: {
    fontFamily: "Inter_700Bold",
    fontSize: 13,
    color: c.accent,
    textTransform: "uppercase",
    letterSpacing: 1.5,
  },
  date: {
    fontFamily: "Inter_400Regular",
    fontSize: 12,
    color: c.textSecondary,
  },
  title: {
    fontFamily: "Inter_700Bold",
    fontSize: 22,
    color: c.text,
    paddingHorizontal: 16,
    lineHeight: 28,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 16,
  },
  statCard: {
    flex: 1,
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    alignItems: "center",
    gap: 4,
    borderWidth: 1,
    borderColor: c.border,
  },
  statLabel: {
    fontFamily: "Inter_500Medium",
    fontSize: 11,
    color: c.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  statValue: {
    fontFamily: "Inter_700Bold",
    fontSize: 36,
  },
  statSub: {
    fontFamily: "Inter_500Medium",
    fontSize: 12,
  },
  detailCard: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: c.border,
    gap: 4,
  },
  cardHeader: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.accent,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
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
  },
  divider: {
    height: 1,
    backgroundColor: c.border,
  },
  copyCard: {
    backgroundColor: c.card,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    borderWidth: 1,
    borderColor: c.border,
    gap: 4,
  },
  copyHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  copyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: c.accent + "15",
  },
  copyBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 12,
    color: c.accent,
  },
  btnPressed: {
    opacity: 0.8,
    transform: [{ scale: 0.97 }],
  },
  contentText: {
    fontFamily: "Inter_400Regular",
    fontSize: 15,
    color: c.text,
    lineHeight: 22,
  },
  deleteBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: c.danger + "15",
    borderWidth: 1,
    borderColor: c.danger + "30",
  },
  deleteBtnText: {
    fontFamily: "Inter_600SemiBold",
    fontSize: 14,
    color: c.danger,
  },
});
