import { StyleSheet, Text, View } from "react-native";

type ChatBubbleProps = {
  text: string;
  isOwn: boolean;
};

export default function ChatBubble({ text, isOwn }: ChatBubbleProps) {
  const containerStyle = [
    styles.bubble,
    isOwn ? styles.ownBubble : styles.otherBubble,
  ];

  return (
    <View
      style={[
        styles.wrapper,
        { justifyContent: isOwn ? "flex-end" : "flex-start" },
      ]}
    >
      <View style={containerStyle}>
        <Text style={[styles.text, isOwn && styles.ownText]}>{text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    marginBottom: 12,
    paddingHorizontal: 8,
  },
  bubble: {
    maxWidth: "80%",
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  ownBubble: {
    backgroundColor: "#ff4f81",
    borderBottomRightRadius: 4,
  },
  otherBubble: {
    backgroundColor: "#f2f2f2",
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 16,
    color: "#333",
    lineHeight: 22,
  },
  ownText: {
    color: "#fff",
  },
});
