import { StyleSheet, Text, View } from "react-native";

type HobbyChipsProps = {
  hobbies: string[];
};

export default function HobbyChips({ hobbies }: HobbyChipsProps) {
  if (hobbies.length === 0) return null;

  return (
    <View style={styles.container}>
      {hobbies.map((hobby) => (
        <View key={hobby} style={styles.chip}>
          <Text style={styles.text}>{hobby}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  chip: {
    backgroundColor: "#f5f5f5",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  text: {
    color: "#555",
    fontSize: 14,
    fontWeight: "500",
  },
});
