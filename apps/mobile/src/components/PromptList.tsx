import { StyleSheet, Text, View } from "react-native";
import { ProfilePrompt } from "../lib/types";

type PromptListProps = {
  prompts: ProfilePrompt[];
};

export default function PromptList({ prompts }: PromptListProps) {
  if (prompts.length === 0) return null;

  return (
    <View style={styles.container}>
      {prompts.map((prompt, index) => (
        <View key={`${prompt.question}-${index}`} style={styles.prompt}>
          <Text style={styles.question}>{prompt.question}</Text>
          <Text style={styles.answer}>{prompt.answer}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 12,
  },
  prompt: {
    backgroundColor: "#fafafa",
    borderRadius: 12,
    padding: 12,
  },
  question: {
    fontSize: 14,
    fontWeight: "600",
    color: "#666",
    marginBottom: 4,
  },
  answer: {
    fontSize: 16,
    color: "#333",
    lineHeight: 22,
  },
});
