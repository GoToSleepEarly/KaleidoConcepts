import { describe, expect, it } from "vitest";

import { normalizeLessonText } from "./normalize";

const validLesson = `Introduction
Lily is learning weather words with her teacher.

第一阶段：A Rainy Morning
Lily opens the window. The sky is ____. She puts on her ____ coat.

第二阶段：At the Bus Stop
Lily sees a big ____. She says hello to the ____ driver.

第三阶段：In the Classroom
The teacher draws a ____ cloud. Lily writes one ____ sentence.

第四阶段：After School
Lily walks home with a ____. They jump over a small ____.

第五阶段：A Sunny Ending
The rain stops. Lily sees a bright ____ and feels ____.

Answer Key
gray
yellow
bus
kind
blue
short
friend
puddle
rainbow
happy

Homework Reading
Read the story again and circle the weather words.`;

describe("normalizeLessonText", () => {
  it("converts valid lesson text into five sections with two image slots each", () => {
    const result = normalizeLessonText(validLesson);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.lesson.sections).toHaveLength(5);
    expect(result.lesson.answerKey).toHaveLength(10);
    expect(result.lesson.sections[0].imageSlots).toEqual([
      { id: "section-1-image-1", slotIndex: 1 },
      { id: "section-1-image-2", slotIndex: 2 },
    ]);
    expect(result.lesson.sections[0].blocks[0].segments).toEqual([
      { type: "text", text: "Lily opens the window. The sky is " },
      { type: "blank", id: "blank-1", answerKeyId: "answer-1" },
      { type: "text", text: ". She puts on her " },
      { type: "blank", id: "blank-2", answerKeyId: "answer-2" },
      { type: "text", text: " coat." },
    ]);
  });

  it("rejects lessons when blank count differs from answer key count", () => {
    const result = normalizeLessonText(validLesson.replace("\nhappy\n", "\n"));

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("BLANK_ANSWER_MISMATCH");
  });
});
