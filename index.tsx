import React, { useCallback, useState } from "react";
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Pressable,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useFocusEffect } from "expo-router";
import * as Haptics from "expo-haptics";
import Colors from "@/constants/colors";
import { getDrafts, deleteDraft } from "@/lib/storage";
import type { ListingDraft } from "@/lib/types";

const c = Colors.dark;

function DraftCard({
  item,
  onDelete,
}: {
  item: ListingDraft;
  onDelete: (id: string) => void;
}) {
  const getProbabilityColor = (score: number) => {
    if (score >= 75) return c.success;
    if (score >= 45) return c.warning;
    return c.danger;
  };

  return (
    <Pressable
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        router.push({ pathname: "/draft/[id]", params: { id: item.id } });
      }}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        if (Platform.OS === "web") {
          if (confirm("Delete this draft?")) onDelete(item.id);
        } else {
          Alert.alert("Delete Draft", "Remove this listing draft?", [
            { text: "Cancel", style: "cancel" },
            {
              text: "Delete",
              style: "destructive",
              onPress: () => onDelete(item.id),
            },
          ]);
        }
      }}
    >
      <Image
        source={{ uri: item.imageUri }}
        style={styles.cardImage}
        contentFit="cover"
      />
      <View style={styles.cardContent}>
        <Text style={styles.cardBrand} numberOfLines={1}>
          {item.brand}
        </Text>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.cardMeta}>
          <View style={styles.metaBadge}>
            <Text style={styles.metaText}>{item.category}</Text>
          </View>
          <View style={styles.metaBadge}>
            <Text style={styles.metaText}>{item.condition}</Text>
          </View>
        </View>
      </View>
      <View style={styles.cardStats}>
        <Text
          style={[
            styles.probability,
            { color: getProbabilityColor(item.sellProbability) },
          ]}
        >
          {item.sellProbability}%
        </Text>
        <Text style={styles.probabilityLabel}>sell</Text>
        <View style={styles.priceBadge}>
          <Text style={styles.priceText}>${item.suggestedPrice}</Text>
        </View>
      </View>
    </Pressable>
  );
}

export default function DashboardScreen() {
  const insets = useSafeAreaInsets();
  const [drafts, setDrafts] = useState<ListingDraft[]>([]);
  const [loading, setLoading] = useState(true);

  const loadDrafts = useCallback(async () => {
    setLoading(true);
    const data = await getDrafts();
    setDrafts(data);
    setLoading(false);
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadDrafts();
    }, [loadDrafts]),
  );

  const handleDelete = async (id: string) => {
    await deleteDraft(id);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    loadDrafts();
  };

  const webTopInset = Platform.OS === "web" ? 67 : 0;

  return (
    <View style={styles.container}>
      <View
        style={[styles.header, { paddingTop: insets.top + 12 + webTopInset }]}
      >
        <Text style={styles.headerTitle}>Speed Dashboard</Text>
        <Text style={styles.headerSubtitle}>
          {drafts.length} pending draft{drafts.length !== 1 ? "s" : ""}
        </Text>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={c.accent} />
        </View>
      ) : drafts.length === 0 ? (
        <View style={styles.center}>
          <Ionicons name="shirt-outline" size={64} color={c.textSecondary} />
          <Text style={styles.emptyTitle}>No Drafts Yet</Text>
          <Text style={styles.emptyText}>
            Snap a photo of clothing to create your first listing
          </Text>
        </View>
      ) : (
        <FlatList
          data={drafts}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <DraftCard item={item} onDelete={handleDelete} />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: insets.bottom + 100 },
          ]}
          scrollEnabled={!!drafts.length}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: c.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 16,
    backgroundColor: c.card,
    borderBottomWidth: 1,
    borderBottomColor: c.border,
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
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter_600SemiBold",
    color: c.text,
  },
  emptyText: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    color: c.textSecondary,
    textAlign: "center",
    lineHeight: 20,
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    flexDirection: "row",
    backgroundColor: c.card,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: c.border,
  },
  cardPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.98 }],
  },
  cardImage: {
    width: 90,
    height: 100,
  },
  cardContent: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
    gap: 4,
  },
  cardBrand: {
    fontSize: 11,
    fontFamily: "Inter_600SemiBold",
    color: c.accent,
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  cardTitle: {
    fontSize: 14,
    fontFamily: "Inter_500Medium",
    color: c.text,
    lineHeight: 18,
  },
  cardMeta: {
    flexDirection: "row",
    gap: 6,
    marginTop: 2,
  },
  metaBadge: {
    backgroundColor: c.cardElevated,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  metaText: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: c.textSecondary,
  },
  cardStats: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
    gap: 2,
  },
  probability: {
    fontSize: 22,
    fontFamily: "Inter_700Bold",
  },
  probabilityLabel: {
    fontSize: 10,
    fontFamily: "Inter_400Regular",
    color: c.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  priceBadge: {
    backgroundColor: c.accent + "20",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 4,
  },
  priceText: {
    fontSize: 13,
    fontFamily: "Inter_700Bold",
    color: c.accent,
  },
});
