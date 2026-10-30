# V13.1 — Safe Hindi local FilmCraft commands

Supported explicitly anchored Hindi editing commands now produce the same typed FilmCraft actions as English commands, without model provider and without additional charges.
Examples: चयनित क्लिप को 2 सेकंड पर काटो; चयनित क्लिप हटाओ; पिछला बदलाव वापस करो; बदलाव दोबारा करो; चयनित क्लिप को v2 ट्रैक पर 2 सेकंड पर ले जाओ.
Other allowed forms: चयनित मीडिया को v1 ट्रैक पर 0 सेकंड पर लगाओ; चयनित क्लिप के अंत से -3 फ्रेम ट्रिम करो.
Commands still need a verified project, real selected clip/media ID, valid bounded duration and separate user approval. The same English parser rejects unknown commands, invented IDs, appended instructions and shell operations.
Native Windows E2E additionally checks that a Hindi deletion proposal, when rejected, leaves actual on-disk FilmCraft project bytes unchanged. This is added as a strict test, not a claimed PASS until CI completes.