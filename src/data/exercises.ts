import type { Exercise } from '../domain/types'

// Exercise library for a condo gym: dumbbells, selectorised machines, cables,
// lat pulldown, adjustable bench, bodyweight, stationary bike, treadmill, pool.
//
// Safety tags drive the symptom gate (src/engine/symptomGate.ts):
//   knee AMBER  -> avoid impact, deep_knee_flexion;   knee RED -> also knee_load
//   back AMBER  -> avoid spinal_flexion, axial_load;  back RED -> also spinal_load
//   neck AMBER  -> avoid overhead;                    neck RED -> also neck_load
// Substitutions are ordered safest-first for a user with bilateral meniscus
// tears plus lower/mid/upper back and neck issues. Every id in `substitutions`
// must exist in this library (asserted in __tests__/data.test.ts).

const UPPER: Exercise[] = [
  // ---------- Horizontal push ----------
  {
    id: 'db_bench_press', name: 'Dumbbell Bench Press', equipment: 'dumbbell',
    primaryMuscles: ['chest'], secondaryMuscles: ['front delts', 'triceps'], pattern: 'horizontal_push',
    safetyTags: [], substitutions: ['machine_chest_press', 'db_floor_press', 'incline_db_press', 'push_up'],
    instructions: 'Lie flat with feet planted and a light natural arch — do not force the lower back into the bench or over-arch it. Lower the dumbbells to chest level with elbows about 45 degrees from the torso, then press up and slightly inward. Keep the back of your head resting on the bench and the chin neutral; never crane the neck to watch the weights.',
    timed: false,
  },
  {
    id: 'incline_db_press', name: 'Incline Dumbbell Press', equipment: 'dumbbell',
    primaryMuscles: ['upper chest'], secondaryMuscles: ['front delts', 'triceps'], pattern: 'horizontal_push',
    safetyTags: [], substitutions: ['machine_chest_press', 'db_bench_press', 'incline_push_up'],
    instructions: 'Set the bench to 30 degrees and keep your whole back and head in contact with the pad. Lower to the upper chest with wrists stacked over elbows, then press up without shrugging the shoulders towards the ears. If the neck tightens, lower the incline or switch to the machine press.',
    timed: false,
  },
  {
    id: 'machine_chest_press', name: 'Machine Chest Press', equipment: 'machine',
    primaryMuscles: ['chest'], secondaryMuscles: ['front delts', 'triceps'], pattern: 'horizontal_push',
    safetyTags: [], substitutions: ['db_floor_press', 'db_bench_press', 'push_up'],
    instructions: 'Set the seat so the handles sit at mid-chest and rest your head and upper back against the pad throughout. Press smoothly to just short of lockout and control the return to a comfortable stretch, not an extreme one. This is the safest pressing option on a stiff-back or sore-neck day because the spine is fully supported.',
    timed: false,
  },
  {
    id: 'db_floor_press', name: 'Dumbbell Floor Press', equipment: 'dumbbell',
    primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front delts'], pattern: 'horizontal_push',
    safetyTags: [], substitutions: ['machine_chest_press', 'push_up'],
    instructions: 'Lie on the floor with knees bent and feet flat so the lower back stays neutral. Press the dumbbells up, then lower until the upper arms lightly touch the floor and pause. The limited range keeps the shoulders happy and the head stays supported on the floor the whole time.',
    timed: false,
  },
  {
    id: 'cable_fly', name: 'Cable Fly', equipment: 'cable',
    primaryMuscles: ['chest'], secondaryMuscles: ['front delts'], pattern: 'chest_isolation',
    safetyTags: [], substitutions: ['pec_deck', 'machine_chest_press', 'push_up'],
    instructions: 'Set the pulleys at chest height, take a split stance and keep a soft bend in the front knee. Bring the handles together in a wide arc with a slight elbow bend, squeezing the chest rather than the shoulders. Keep the ribs down and avoid leaning far forward, which loads the lower back.',
    timed: false,
  },
  {
    id: 'pec_deck', name: 'Pec Deck', equipment: 'machine',
    primaryMuscles: ['chest'], secondaryMuscles: ['front delts'], pattern: 'chest_isolation',
    safetyTags: [], substitutions: ['cable_fly', 'machine_chest_press'],
    instructions: 'Sit tall with your back and head against the pad and forearms on the arm pads. Bring the arms together slowly and open only to a comfortable stretch — do not let the shoulders roll forward or the chest collapse. Neutral chin, breathe out as you squeeze.',
    timed: false,
  },
  {
    id: 'push_up', name: 'Push-Up', equipment: 'bodyweight',
    primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front delts', 'core'], pattern: 'horizontal_push',
    safetyTags: [], substitutions: ['incline_push_up', 'machine_chest_press'],
    instructions: 'Hands slightly wider than shoulders, body in one straight line from head to heels with the glutes squeezed so the lower back does not sag. Lower until the chest is a fist from the floor, then press up. Look at the floor a little ahead of your hands to keep the neck neutral; if wrists or back complain, elevate the hands.',
    timed: false,
  },
  {
    id: 'incline_push_up', name: 'Incline Push-Up', equipment: 'bodyweight',
    primaryMuscles: ['chest'], secondaryMuscles: ['triceps', 'front delts', 'core'], pattern: 'horizontal_push',
    safetyTags: [], substitutions: ['machine_chest_press', 'push_up'],
    instructions: 'Hands on a bench or sturdy rail, body straight with hips tucked so the lower back stays neutral. Lower the chest to the edge, elbows tucked about 45 degrees, then press away. The higher the hands, the easier it is on the back and shoulders.',
    timed: false,
  },

  // ---------- Vertical pull ----------
  {
    id: 'lat_pulldown', name: 'Lat Pulldown', equipment: 'cable',
    primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'rear delts', 'mid back'], pattern: 'vertical_pull',
    safetyTags: [], substitutions: ['seated_cable_row', 'straight_arm_pulldown', 'assisted_pull_up', 'machine_row'],
    instructions: 'Lock the thigh pads so your feet stay flat and pull the bar to the top of the chest, leaning back only slightly from the hips. Drive the elbows down and back, then let the bar rise under control to a full but comfortable stretch. Keep the chin level and look straight ahead — do not tip the head back or pull the bar behind the neck.',
    timed: false,
  },
  {
    id: 'straight_arm_pulldown', name: 'Straight-Arm Pulldown', equipment: 'cable',
    primaryMuscles: ['lats'], secondaryMuscles: ['triceps (long head)', 'core'], pattern: 'vertical_pull',
    safetyTags: [], substitutions: ['lat_pulldown', 'seated_cable_row'],
    instructions: 'Face a high pulley, hinge slightly at the hips with a neutral spine and soft knees. With a small elbow bend, sweep the bar down to the thighs using the lats, then return slowly. Keep the ribs down so the lower back does not arch as the arms rise.',
    timed: false,
  },
  {
    id: 'assisted_pull_up', name: 'Assisted Pull-Up', equipment: 'machine',
    primaryMuscles: ['lats'], secondaryMuscles: ['biceps', 'mid back'], pattern: 'vertical_pull',
    safetyTags: ['overhead'], substitutions: ['lat_pulldown', 'seated_cable_row'],
    instructions: 'Kneel on the assist pad, grip just outside shoulder width and pull until the chin reaches the bar. Lower slowly to a comfortable stretch without letting the shoulders shrug into the ears. Keep the head neutral and eyes forward rather than looking up at the bar.',
    timed: false,
  },
  {
    id: 'db_pullover', name: 'Dumbbell Pullover', equipment: 'dumbbell',
    primaryMuscles: ['lats'], secondaryMuscles: ['chest', 'triceps'], pattern: 'vertical_pull',
    safetyTags: ['overhead'], substitutions: ['straight_arm_pulldown', 'lat_pulldown'],
    instructions: 'Lie across a bench with hips low and the dumbbell held over the chest in both hands. Lower it behind the head only as far as the ribs stay down and the lower back stays flat, then pull it back over the chest. Stop short of any pinch in the shoulders and keep the head supported on the bench.',
    timed: false,
  },

  // ---------- Horizontal pull ----------
  {
    id: 'seated_cable_row', name: 'Seated Cable Row', equipment: 'cable',
    primaryMuscles: ['mid back'], secondaryMuscles: ['lats', 'biceps', 'rear delts'], pattern: 'horizontal_pull',
    safetyTags: [], substitutions: ['machine_row', 'chest_supported_db_row', 'one_arm_db_row'],
    instructions: 'Sit tall with knees softly bent and feet braced. Pull the handle to the lower ribs, driving the elbows back and squeezing the shoulder blades, then let the arms extend without letting the lower back round. Keep the torso nearly still — the row comes from the arms and back, not from rocking the spine.',
    timed: false,
  },
  {
    id: 'machine_row', name: 'Machine Row (chest pad)', equipment: 'machine',
    primaryMuscles: ['mid back'], secondaryMuscles: ['lats', 'biceps', 'rear delts'], pattern: 'horizontal_pull',
    safetyTags: [], substitutions: ['seated_cable_row', 'chest_supported_db_row'],
    instructions: 'Set the chest pad so the handles are at mid-chest and keep your chest glued to it throughout. Row the handles back and squeeze between the shoulder blades, then extend slowly. The pad takes the load off the lower back, so this is a good choice on a sore-back day.',
    timed: false,
  },
  {
    id: 'chest_supported_db_row', name: 'Chest-Supported Dumbbell Row', equipment: 'dumbbell',
    primaryMuscles: ['mid back'], secondaryMuscles: ['lats', 'biceps', 'rear delts'], pattern: 'horizontal_pull',
    safetyTags: [], substitutions: ['machine_row', 'seated_cable_row', 'one_arm_db_row'],
    instructions: 'Lie chest-down on a 30–45 degree bench with the dumbbells hanging straight down. Row the elbows up and back until the dumbbells reach the ribs, then lower under control. Keep the forehead lightly off or on the pad with a neutral neck — do not lift the head to look forward.',
    timed: false,
  },
  {
    id: 'one_arm_db_row', name: 'One-Arm Dumbbell Row', equipment: 'dumbbell',
    primaryMuscles: ['lats'], secondaryMuscles: ['mid back', 'biceps'], pattern: 'horizontal_pull',
    safetyTags: [], substitutions: ['chest_supported_db_row', 'machine_row', 'seated_cable_row'],
    instructions: 'Place one hand and the same-side knee on the bench so the back is flat and supported, and keep the standing knee soft. Row the dumbbell to the hip, elbow close to the body, then lower it fully without twisting the torso. Look at the floor to keep the neck in line with the spine.',
    timed: false,
  },
  {
    id: 'bent_over_db_row', name: 'Bent-Over Dumbbell Row', equipment: 'dumbbell',
    primaryMuscles: ['mid back'], secondaryMuscles: ['lats', 'biceps', 'lower back'], pattern: 'horizontal_pull',
    safetyTags: ['spinal_load'], substitutions: ['chest_supported_db_row', 'machine_row', 'seated_cable_row'],
    instructions: 'Hinge at the hips with knees soft and a flat back, torso about 45 degrees, and brace the core before each rep. Row both dumbbells to the hips and lower slowly without letting the spine round. If the lower back tires before the upper back, switch to a chest-supported row.',
    timed: false,
  },
  {
    id: 'inverted_row', name: 'Inverted Row', equipment: 'bodyweight',
    primaryMuscles: ['mid back'], secondaryMuscles: ['lats', 'biceps', 'core'], pattern: 'horizontal_pull',
    safetyTags: [], substitutions: ['machine_row', 'seated_cable_row'],
    instructions: 'Hang under a Smith bar or rack bar with heels on the floor and body straight. Pull the chest to the bar keeping the hips in line and glutes tight, then lower slowly. Tuck the chin slightly — do not let the head crane forward to reach the bar; raise the bar height to make it easier.',
    timed: false,
  },

  // ---------- Vertical push and shoulders ----------
  {
    id: 'db_shoulder_press', name: 'Seated Dumbbell Shoulder Press', equipment: 'dumbbell',
    primaryMuscles: ['front delts'], secondaryMuscles: ['side delts', 'triceps'], pattern: 'vertical_push',
    safetyTags: ['overhead', 'neck_load'], substitutions: ['machine_shoulder_press', 'lateral_raise', 'db_front_raise'],
    instructions: 'Sit on an upright bench with your back and head against the pad and feet flat. Press the dumbbells up and slightly inward, stopping just short of lockout, and lower to about ear level. Keep the chin tucked and ribs down — do not push the head forward or arch the lower back to finish a rep. Skip this on a neck-flare day and use lateral raises instead.',
    timed: false,
  },
  {
    id: 'machine_shoulder_press', name: 'Machine Shoulder Press', equipment: 'machine',
    primaryMuscles: ['front delts'], secondaryMuscles: ['side delts', 'triceps'], pattern: 'vertical_push',
    safetyTags: ['overhead', 'neck_load'], substitutions: ['lateral_raise', 'db_front_raise', 'machine_chest_press'],
    instructions: 'Set the seat so the handles start at about ear height and keep your head and back on the pad. Press up smoothly and lower under control; the fixed path is easier on the neck than free weights. Stop the set if you feel the traps take over or the neck tighten.',
    timed: false,
  },
  {
    id: 'arnold_press', name: 'Arnold Press', equipment: 'dumbbell',
    primaryMuscles: ['front delts'], secondaryMuscles: ['side delts', 'triceps'], pattern: 'vertical_push',
    safetyTags: ['overhead', 'neck_load'], substitutions: ['machine_shoulder_press', 'db_shoulder_press', 'lateral_raise'],
    instructions: 'Start seated with palms facing you at shoulder height, then rotate the palms outward as you press up. Keep the head against the bench pad and the ribs down; stop short of full lockout. Use lighter dumbbells than a normal press — the rotation adds range, not strength.',
    timed: false,
  },
  {
    id: 'lateral_raise', name: 'Dumbbell Lateral Raise', equipment: 'dumbbell',
    primaryMuscles: ['side delts'], secondaryMuscles: ['traps'], pattern: 'shoulder_abduction',
    safetyTags: [], substitutions: ['cable_lateral_raise', 'db_front_raise'],
    instructions: 'Stand or sit tall with a slight forward lean and raise the dumbbells out to the side to shoulder height, leading with the elbows. Lower slowly; keep the shoulders down away from the ears so the neck and traps stay relaxed. Light weight and control beat heavy swinging.',
    timed: false,
  },
  {
    id: 'cable_lateral_raise', name: 'Cable Lateral Raise', equipment: 'cable',
    primaryMuscles: ['side delts'], secondaryMuscles: [], pattern: 'shoulder_abduction',
    safetyTags: [], substitutions: ['lateral_raise'],
    instructions: 'Stand side-on to a low pulley with the handle in the far hand and raise the arm out to shoulder height. The cable keeps tension at the bottom, so use a light load and stay tall without side-bending the spine. Keep the neck long and shoulders down.',
    timed: false,
  },
  {
    id: 'db_front_raise', name: 'Dumbbell Front Raise', equipment: 'dumbbell',
    primaryMuscles: ['front delts'], secondaryMuscles: ['upper chest'], pattern: 'shoulder_flexion',
    safetyTags: [], substitutions: ['lateral_raise', 'machine_chest_press'],
    instructions: 'Raise light dumbbells in front of you to shoulder height with a slight elbow bend, then lower slowly. Brace the core so the lower back does not arch as the arms rise. This is the go-to front-delt option when overhead pressing is off the table for the neck.',
    timed: false,
  },
  {
    id: 'face_pull', name: 'Cable Face Pull', equipment: 'cable',
    primaryMuscles: ['rear delts'], secondaryMuscles: ['rotator cuff', 'mid back'], pattern: 'rear_delt',
    safetyTags: [], substitutions: ['rear_delt_fly', 'reverse_pec_deck', 'band_pull_apart'],
    instructions: 'Set a rope at face height, step back into a split stance and pull the rope towards your eyes with the elbows high and wide. Finish with the hands beside the ears and a squeeze between the shoulder blades. Keep the chin neutral and do not jut the head forward to meet the rope.',
    timed: false,
  },
  {
    id: 'rear_delt_fly', name: 'Dumbbell Rear-Delt Fly (incline)', equipment: 'dumbbell',
    primaryMuscles: ['rear delts'], secondaryMuscles: ['mid back'], pattern: 'rear_delt',
    safetyTags: [], substitutions: ['reverse_pec_deck', 'face_pull'],
    instructions: 'Lie chest-down on an incline bench so the back is fully supported, dumbbells hanging below the shoulders. Raise the arms out to the side with a slight elbow bend, squeezing the rear delts, then lower slowly. Keep the neck in line with the spine — look at the floor, not forward.',
    timed: false,
  },
  {
    id: 'reverse_pec_deck', name: 'Reverse Pec Deck', equipment: 'machine',
    primaryMuscles: ['rear delts'], secondaryMuscles: ['mid back'], pattern: 'rear_delt',
    safetyTags: [], substitutions: ['face_pull', 'rear_delt_fly'],
    instructions: 'Face the pad with the handles set forward, chest supported and head neutral. Open the arms back in a wide arc until the hands are in line with the shoulders, then return slowly. Keep the shoulders down and avoid shrugging or poking the chin forward.',
    timed: false,
  },
  {
    id: 'band_pull_apart', name: 'Band Pull-Apart', equipment: 'band',
    primaryMuscles: ['rear delts'], secondaryMuscles: ['mid back', 'rotator cuff'], pattern: 'rear_delt',
    safetyTags: [], substitutions: ['face_pull', 'reverse_pec_deck'],
    instructions: 'Hold a light band at shoulder height with straight arms and pull it apart until it touches the chest, squeezing the shoulder blades. Return slowly. Keep the ribs down and the neck relaxed — this is a warm-up and posture exercise, not a max-effort one.',
    timed: false,
  },
  {
    id: 'db_shrug', name: 'Dumbbell Shrug', equipment: 'dumbbell',
    primaryMuscles: ['traps'], secondaryMuscles: [], pattern: 'shrug',
    safetyTags: ['neck_load'], substitutions: ['face_pull', 'band_pull_apart'],
    instructions: 'Stand tall with dumbbells at the sides and lift the shoulders straight up towards the ears, pause, then lower slowly. Do not roll the shoulders or tip the head forward. Skip this entirely when the neck is irritated — face pulls cover the upper back without loading the neck.',
    timed: false,
  },

  // ---------- Arms ----------
  {
    id: 'db_curl', name: 'Dumbbell Curl', equipment: 'dumbbell',
    primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], pattern: 'elbow_flexion',
    safetyTags: [], substitutions: ['cable_curl', 'hammer_curl', 'preacher_curl_machine'],
    instructions: 'Stand or sit tall with elbows pinned to the sides and curl the dumbbells up without swinging the torso. Lower slowly to a full but comfortable extension. Keep the shoulders down and the neck relaxed — if you find yourself leaning back, drop the weight.',
    timed: false,
  },
  {
    id: 'hammer_curl', name: 'Hammer Curl', equipment: 'dumbbell',
    primaryMuscles: ['biceps', 'brachialis'], secondaryMuscles: ['forearms'], pattern: 'elbow_flexion',
    safetyTags: [], substitutions: ['db_curl', 'cable_curl'],
    instructions: 'Palms facing each other, curl the dumbbells up keeping the elbows still and the wrists neutral. Lower under control. Stay tall through the spine rather than rocking the hips to help the weight up.',
    timed: false,
  },
  {
    id: 'incline_db_curl', name: 'Incline Dumbbell Curl', equipment: 'dumbbell',
    primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], pattern: 'elbow_flexion',
    safetyTags: [], substitutions: ['db_curl', 'cable_curl'],
    instructions: 'Sit back on a 45–60 degree bench with your head and back on the pad and let the arms hang. Curl without letting the elbows drift forward, then lower fully. The supported position keeps the spine and neck out of the movement.',
    timed: false,
  },
  {
    id: 'cable_curl', name: 'Cable Curl', equipment: 'cable',
    primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], pattern: 'elbow_flexion',
    safetyTags: [], substitutions: ['db_curl', 'preacher_curl_machine'],
    instructions: 'Face a low pulley with a bar or rope, elbows at the sides, and curl to the shoulders. Lower slowly against the constant tension. Keep the knees soft and the ribs down so the lower back stays neutral.',
    timed: false,
  },
  {
    id: 'preacher_curl_machine', name: 'Machine Preacher Curl', equipment: 'machine',
    primaryMuscles: ['biceps'], secondaryMuscles: ['forearms'], pattern: 'elbow_flexion',
    safetyTags: [], substitutions: ['cable_curl', 'db_curl'],
    instructions: 'Set the seat so the armpits rest on top of the pad and the upper arms lie flat. Curl to the top and lower slowly without fully slamming into lockout. Sit tall; the pad does the stabilising so the back and neck can stay relaxed.',
    timed: false,
  },
  {
    id: 'triceps_pushdown', name: 'Cable Triceps Pushdown', equipment: 'cable',
    primaryMuscles: ['triceps'], secondaryMuscles: [], pattern: 'elbow_extension',
    safetyTags: [], substitutions: ['machine_triceps_extension', 'db_kickback', 'db_lying_triceps_extension'],
    instructions: 'Stand tall facing a high pulley with elbows tucked to the sides and push the bar or rope down until the arms are straight. Return under control without letting the elbows flare forward. Keep the chin neutral and shoulders down — do not hunch over the cable.',
    timed: false,
  },
  {
    id: 'overhead_cable_triceps', name: 'Overhead Cable Triceps Extension', equipment: 'cable',
    primaryMuscles: ['triceps (long head)'], secondaryMuscles: [], pattern: 'elbow_extension',
    safetyTags: ['overhead'], substitutions: ['triceps_pushdown', 'machine_triceps_extension', 'db_lying_triceps_extension'],
    instructions: 'Face away from a low-to-mid pulley with the rope behind the head, split stance, core braced so the lower back does not arch. Extend the arms forward and up, then return to a comfortable stretch. If the neck or shoulders pinch, swap to pushdowns.',
    timed: false,
  },
  {
    id: 'db_lying_triceps_extension', name: 'Lying Dumbbell Triceps Extension', equipment: 'dumbbell',
    primaryMuscles: ['triceps'], secondaryMuscles: [], pattern: 'elbow_extension',
    safetyTags: [], substitutions: ['triceps_pushdown', 'machine_triceps_extension'],
    instructions: 'Lie on a bench with the dumbbells over the shoulders, then bend only at the elbows to lower them beside the ears. Extend back up without moving the upper arms. Keep the head resting on the bench and feet flat so the back stays neutral.',
    timed: false,
  },
  {
    id: 'machine_triceps_extension', name: 'Machine Triceps Extension', equipment: 'machine',
    primaryMuscles: ['triceps'], secondaryMuscles: [], pattern: 'elbow_extension',
    safetyTags: [], substitutions: ['triceps_pushdown', 'db_kickback'],
    instructions: 'Set the pad so the upper arms rest flat and the elbows line up with the pivot. Extend fully and return slowly. Sit tall with the chest up; the machine removes any need to brace the back or neck.',
    timed: false,
  },
  {
    id: 'db_kickback', name: 'Dumbbell Kickback', equipment: 'dumbbell',
    primaryMuscles: ['triceps'], secondaryMuscles: [], pattern: 'elbow_extension',
    safetyTags: [], substitutions: ['triceps_pushdown', 'machine_triceps_extension'],
    instructions: 'Support one hand and knee on a bench so the back is flat, upper arm parallel to the floor. Extend the elbow until the arm is straight, squeeze, then return. Look at the floor to keep the neck neutral.',
    timed: false,
  },
]

const LOWER: Exercise[] = [
  // ---------- Squat / knee-dominant ----------
  {
    id: 'leg_press', name: 'Leg Press (moderate range)', equipment: 'machine',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'adductors'], pattern: 'squat',
    safetyTags: ['knee_load'], substitutions: ['single_leg_press', 'hip_thrust', 'glute_bridge', 'leg_extension'],
    instructions: 'Feet shoulder width and slightly high on the plate, back and hips glued to the pad. Lower only to about 90 degrees at the knee — stop well before the tailbone lifts or the lower back rounds off the pad — then push through the whole foot without locking the knees. Knees track over the second toe; if either knee clicks, catches or aches, shorten the range or lighten the load.',
    timed: false,
  },
  {
    id: 'single_leg_press', name: 'Single-Leg Press', equipment: 'machine',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings'], pattern: 'squat',
    safetyTags: ['knee_load'], substitutions: ['leg_press', 'glute_bridge', 'leg_extension'],
    instructions: 'Same set-up as the leg press with one foot centred on the plate and the other resting on the floor or frame. Use roughly 40 percent of the two-leg load and a moderate range with the knee tracking straight. This evens out left/right strength without deep knee flexion.',
    timed: false,
  },
  {
    id: 'hack_squat', name: 'Hack Squat (shallow)', equipment: 'machine',
    primaryMuscles: ['quads'], secondaryMuscles: ['glutes', 'adductors'], pattern: 'squat',
    safetyTags: ['knee_load', 'deep_knee_flexion', 'axial_load'], substitutions: ['leg_press', 'single_leg_press', 'glute_bridge'],
    instructions: 'Shoulders under the pads, back flat against the sled and feet slightly forward. Descend only to a shallow-to-moderate depth where the knees feel stable and the heels stay down, then drive up without locking out. The sled loads the spine through the shoulders, so keep the core braced and skip it on back or neck flare-up days.',
    timed: false,
  },
  {
    id: 'goblet_squat', name: 'Goblet Squat (box height)', equipment: 'dumbbell',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['core', 'adductors'], pattern: 'squat',
    safetyTags: ['knee_load', 'deep_knee_flexion', 'axial_load'], substitutions: ['leg_press', 'glute_bridge', 'hip_thrust'],
    instructions: 'Hold a dumbbell at the chest, feet a little wider than hips and toes slightly out. Sit back and down to a bench or box height — no deeper — keeping the heels down, knees over toes and chest tall. Brace the core so the lower back does not round at the bottom, and keep the eyes level rather than looking up at the ceiling.',
    timed: false,
  },
  {
    id: 'db_split_squat', name: 'Dumbbell Split Squat (short range)', equipment: 'dumbbell',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'core'], pattern: 'lunge',
    safetyTags: ['knee_load', 'deep_knee_flexion'], substitutions: ['single_leg_press', 'db_step_up', 'glute_bridge', 'leg_press'],
    instructions: 'Take a long stride with dumbbells at your sides and lower the back knee towards the floor, stopping when the front knee reaches about 90 degrees. Keep the front knee over the mid-foot, torso upright and the weight in the front heel. Shorten the range or hold the rail if either knee feels unstable; use no weight until the pattern is pain-free.',
    timed: false,
  },
  {
    id: 'reverse_lunge', name: 'Reverse Lunge', equipment: 'bodyweight',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'core'], pattern: 'lunge',
    safetyTags: ['knee_load', 'deep_knee_flexion'], substitutions: ['db_split_squat', 'db_step_up', 'single_leg_press', 'glute_bridge'],
    instructions: 'Step one foot back and lower until the front thigh is near parallel, keeping the front knee stacked over the ankle. Push through the front heel to return. Stepping back is gentler on the knees than lunging forward; keep the torso tall and stop before any pinch in the front knee.',
    timed: false,
  },
  {
    id: 'db_step_up', name: 'Dumbbell Step-Up (low box)', equipment: 'dumbbell',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'calves'], pattern: 'lunge',
    safetyTags: ['knee_load'], substitutions: ['single_leg_press', 'glute_bridge', 'leg_press'],
    instructions: 'Use a low step (knee no higher than 90 degrees at the top). Place the whole foot on the box, drive through the heel to stand tall and lower the trailing leg slowly. Keep the working knee tracking over the toes and the torso upright; hold the rail rather than letting the knee wobble.',
    timed: false,
  },
  {
    id: 'leg_extension', name: 'Leg Extension (light)', equipment: 'machine',
    primaryMuscles: ['quads'], secondaryMuscles: [], pattern: 'knee_extension',
    safetyTags: ['knee_load'], substitutions: ['leg_press', 'single_leg_press', 'glute_bridge'],
    instructions: 'Align the knee with the machine pivot and set the back pad so the thighs are supported. Extend smoothly through the top two-thirds of the range and lower under control — keep the load light and the tempo slow. Stop immediately on any sharp pain, clicking or a feeling of the knee catching.',
    timed: false,
  },

  // ---------- Hinge / hip-dominant ----------
  {
    id: 'hip_thrust', name: 'Hip Thrust', equipment: 'dumbbell',
    primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'core'], pattern: 'hinge',
    safetyTags: ['spinal_load'], substitutions: ['glute_bridge', 'single_leg_glute_bridge', 'cable_pull_through'],
    instructions: 'Upper back on a bench, dumbbell across the hips, feet flat so the shins are vertical at the top. Drive the hips up until the torso is level, squeezing the glutes, then lower under control. Tuck the chin and keep the ribs down — finish with a posterior tilt, never by arching the lower back.',
    timed: false,
  },
  {
    id: 'glute_bridge', name: 'Glute Bridge', equipment: 'bodyweight',
    primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'core'], pattern: 'hinge',
    safetyTags: [], substitutions: ['single_leg_glute_bridge', 'cable_pull_through', 'hip_thrust'],
    instructions: 'Lie on your back with knees bent and feet flat about hip width. Squeeze the glutes to lift the hips until the body is straight from shoulders to knees, hold a second, then lower slowly. Keep the ribs down so the lower back does not arch, and rest the head on the floor with the neck relaxed. This is the safest hip exercise in the library.',
    timed: false,
  },
  {
    id: 'single_leg_glute_bridge', name: 'Single-Leg Glute Bridge', equipment: 'bodyweight',
    primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings', 'core'], pattern: 'hinge',
    safetyTags: [], substitutions: ['glute_bridge', 'cable_pull_through'],
    instructions: 'Set up as a glute bridge, then hold one knee to the chest or extend that leg. Drive through the planted heel to lift the hips without letting them tilt, and lower slowly. Keep the head down and the ribs tucked; the knee of the working leg stays over the ankle.',
    timed: false,
  },
  {
    id: 'db_rdl', name: 'Dumbbell Romanian Deadlift', equipment: 'dumbbell',
    primaryMuscles: ['hamstrings', 'glutes'], secondaryMuscles: ['lower back', 'core'], pattern: 'hinge',
    safetyTags: ['spinal_load'], substitutions: ['seated_leg_curl', 'lying_leg_curl', 'cable_pull_through', 'glute_bridge', 'back_extension_45'],
    instructions: 'Stand tall with dumbbells in front of the thighs and knees softly bent. Push the hips back and slide the dumbbells down the legs, keeping the spine neutral and the shoulder blades set, until you feel a hamstring stretch — usually just below the knee. Drive the hips forward to stand; look at the floor a few metres ahead so the neck stays in line rather than craning up.',
    timed: false,
  },
  {
    id: 'cable_pull_through', name: 'Cable Pull-Through', equipment: 'cable',
    primaryMuscles: ['glutes', 'hamstrings'], secondaryMuscles: ['core'], pattern: 'hinge',
    safetyTags: ['spinal_load'], substitutions: ['glute_bridge', 'seated_leg_curl', 'hip_thrust'],
    instructions: 'Face away from a low pulley with the rope between the legs and feet shoulder width. Hinge at the hips with a neutral spine and soft knees, then squeeze the glutes to stand tall without leaning back. The cable pulls you backward, so the load on the lower back is lighter than an RDL — a good hinge on stiff-back days.',
    timed: false,
  },
  {
    id: 'back_extension_45', name: '45-Degree Back Extension (hip hinge)', equipment: 'machine',
    primaryMuscles: ['glutes', 'hamstrings'], secondaryMuscles: ['lower back'], pattern: 'hinge',
    safetyTags: ['spinal_load'], substitutions: ['glute_bridge', 'cable_pull_through', 'bird_dog'],
    instructions: 'Set the pad just below the hip crease and hinge from the hips with a neutral, braced spine — think of it as a glute exercise, not a lower-back one. Rise only to a straight line, never hyperextend, and keep the chin tucked with eyes on the floor. Bodyweight only until pain-free.',
    timed: false,
  },
  {
    id: 'lying_leg_curl', name: 'Lying Leg Curl', equipment: 'machine',
    primaryMuscles: ['hamstrings'], secondaryMuscles: ['calves'], pattern: 'knee_flexion',
    safetyTags: [], substitutions: ['seated_leg_curl', 'swiss_ball_leg_curl', 'glute_bridge'],
    instructions: 'Line the knees up with the pivot and keep the hips pressed into the pad throughout — do not let the hips lift as you curl. Bring the heels towards the glutes with a full but pain-free range and lower slowly. Rest the forehead on the hands so the neck is not held up.',
    timed: false,
  },
  {
    id: 'seated_leg_curl', name: 'Seated Leg Curl', equipment: 'machine',
    primaryMuscles: ['hamstrings'], secondaryMuscles: ['calves'], pattern: 'knee_flexion',
    safetyTags: [], substitutions: ['lying_leg_curl', 'swiss_ball_leg_curl', 'glute_bridge'],
    instructions: 'Sit with the back against the pad, thigh pad snug and knees aligned with the pivot. Curl the heels down and back under control, then return slowly without letting the weight stack slam. The seated position keeps the spine supported and works the hamstrings without knee compression.',
    timed: false,
  },
  {
    id: 'swiss_ball_leg_curl', name: 'Swiss Ball Leg Curl', equipment: 'bodyweight',
    primaryMuscles: ['hamstrings'], secondaryMuscles: ['glutes', 'core'], pattern: 'knee_flexion',
    safetyTags: [], substitutions: ['lying_leg_curl', 'seated_leg_curl', 'glute_bridge'],
    instructions: 'Lie on your back with the heels on a stability ball and lift the hips into a bridge. Curl the ball towards you, keeping the hips up, then roll it back out slowly. Keep the head and shoulders relaxed on the floor and stop if the hamstrings cramp.',
    timed: false,
  },

  // ---------- Calves / hips ----------
  {
    id: 'standing_calf_raise', name: 'Standing Calf Raise', equipment: 'machine',
    primaryMuscles: ['calves'], secondaryMuscles: [], pattern: 'calf',
    safetyTags: ['axial_load'], substitutions: ['seated_calf_raise', 'calf_press_leg_press'],
    instructions: 'Shoulders under the pads with the balls of the feet on the step, knees straight but not locked. Rise onto the toes, pause, and lower to a comfortable stretch. Because the pads load through the spine, keep the core braced and swap to the seated version on sore-back or sore-neck days.',
    timed: false,
  },
  {
    id: 'seated_calf_raise', name: 'Seated Calf Raise', equipment: 'machine',
    primaryMuscles: ['calves (soleus)'], secondaryMuscles: [], pattern: 'calf',
    safetyTags: [], substitutions: ['calf_press_leg_press', 'standing_calf_raise'],
    instructions: 'Knee pads across the lower thighs, balls of the feet on the platform. Lift the heels as high as possible, pause, and lower slowly to a stretch. The spine is unloaded here, so this is the default calf move on back or neck days.',
    timed: false,
  },
  {
    id: 'calf_press_leg_press', name: 'Calf Press on Leg Press', equipment: 'machine',
    primaryMuscles: ['calves'], secondaryMuscles: [], pattern: 'calf',
    safetyTags: [], substitutions: ['seated_calf_raise', 'standing_calf_raise'],
    instructions: 'On the leg press with legs nearly straight (never locked), place the balls of the feet on the bottom edge of the plate. Push through the toes and lower to a stretch under control. Back and head stay on the pad throughout.',
    timed: false,
  },
  {
    id: 'hip_abduction_machine', name: 'Hip Abduction Machine', equipment: 'machine',
    primaryMuscles: ['glute medius'], secondaryMuscles: ['glutes'], pattern: 'hip_abduction',
    safetyTags: [], substitutions: ['cable_hip_abduction', 'side_lying_hip_abduction'],
    instructions: 'Sit tall with the back on the pad and press the knees outward against the pads, pause, and return slowly. Do not lean forward or rock the pelvis to force more range. Strong hip abductors help the knees track well, so this is a knee-friendly staple.',
    timed: false,
  },
  {
    id: 'hip_adduction_machine', name: 'Hip Adduction Machine', equipment: 'machine',
    primaryMuscles: ['adductors'], secondaryMuscles: [], pattern: 'hip_adduction',
    safetyTags: [], substitutions: ['hip_abduction_machine', 'glute_bridge'],
    instructions: 'Set the pads to a comfortable, not extreme, starting width and squeeze the knees together slowly. Return under control without letting the pads yank the legs open. Keep the back on the pad and the load moderate.',
    timed: false,
  },
  {
    id: 'cable_hip_abduction', name: 'Cable Hip Abduction', equipment: 'cable',
    primaryMuscles: ['glute medius'], secondaryMuscles: ['core'], pattern: 'hip_abduction',
    safetyTags: [], substitutions: ['hip_abduction_machine', 'side_lying_hip_abduction'],
    instructions: 'Ankle strap on the outer leg, standing side-on to a low pulley holding the frame. Lift the leg out to the side without leaning the torso, then return slowly. Keep the standing knee soft and the hips square.',
    timed: false,
  },
  {
    id: 'side_lying_hip_abduction', name: 'Side-Lying Hip Abduction', equipment: 'bodyweight',
    primaryMuscles: ['glute medius'], secondaryMuscles: [], pattern: 'hip_abduction',
    safetyTags: [], substitutions: ['hip_abduction_machine', 'cable_hip_abduction'],
    instructions: 'Lie on your side with the bottom knee bent and the top leg straight, hips stacked. Lift the top leg about 30 degrees with the toes pointing slightly down, then lower slowly. Support the head on the arm or a pillow so the neck stays neutral.',
    timed: false,
  },
  {
    id: 'glute_kickback_machine', name: 'Glute Kickback (cable or machine)', equipment: 'cable',
    primaryMuscles: ['glutes'], secondaryMuscles: ['hamstrings'], pattern: 'hip_extension',
    safetyTags: [], substitutions: ['glute_bridge', 'hip_thrust'],
    instructions: 'Ankle strap on a low pulley, hands on the frame, torso slightly forward with a neutral spine. Drive the heel back and up using the glute, keeping the working knee only softly bent, and return slowly. Do not arch the lower back to gain height.',
    timed: false,
  },
]

const CORE_AND_CARDIO: Exercise[] = [
  // ---------- Core ----------
  {
    id: 'dead_bug', name: 'Dead Bug', equipment: 'bodyweight',
    primaryMuscles: ['deep core'], secondaryMuscles: ['hip flexors'], pattern: 'core_anti_extension',
    safetyTags: [], substitutions: ['bird_dog', 'plank'],
    instructions: 'Lie on your back with arms straight up and knees over hips. Press the lower back gently into the floor, then slowly extend the opposite arm and leg away without letting the back arch. Return and switch sides; keep the head down and breathe out as the limbs extend. Ideal core work for a sensitive back and neck.',
    timed: false,
  },
  {
    id: 'bird_dog', name: 'Bird Dog', equipment: 'bodyweight',
    primaryMuscles: ['deep core', 'lower back'], secondaryMuscles: ['glutes', 'shoulders'], pattern: 'core_anti_extension',
    safetyTags: [], substitutions: ['dead_bug', 'plank'],
    instructions: 'On hands and knees with a flat back, reach one arm forward and the opposite leg back until they are level with the torso, pause two seconds, and return. Keep the hips square and the neck long by looking at the floor between the hands. Place a folded towel under the knees if kneeling is uncomfortable.',
    timed: false,
  },
  {
    id: 'plank', name: 'Front Plank', equipment: 'bodyweight',
    primaryMuscles: ['core'], secondaryMuscles: ['shoulders', 'glutes'], pattern: 'core_anti_extension',
    safetyTags: [], substitutions: ['dead_bug', 'bird_dog', 'side_plank'],
    instructions: 'Forearms on the floor, elbows under shoulders, body in one straight line with the glutes squeezed and the ribs tucked so the lower back does not sag. Look at the floor just ahead of the hands to keep the neck neutral. Stop the hold before form breaks — quality seconds count, shaking ones do not.',
    timed: true,
  },
  {
    id: 'side_plank', name: 'Side Plank (knees bent)', equipment: 'bodyweight',
    primaryMuscles: ['obliques'], secondaryMuscles: ['glute medius', 'shoulders'], pattern: 'core_lateral',
    safetyTags: [], substitutions: ['pallof_press', 'plank', 'dead_bug'],
    instructions: 'Lie on your side with the elbow under the shoulder and knees bent behind you, then lift the hips so the body is straight from head to knees. Keep the head in line with the spine, not dropped. Progress to straight legs only when the bent-knee version is easy and pain-free.',
    timed: true,
  },
  {
    id: 'pallof_press', name: 'Pallof Press', equipment: 'cable',
    primaryMuscles: ['obliques', 'deep core'], secondaryMuscles: ['shoulders'], pattern: 'core_anti_rotation',
    safetyTags: [], substitutions: ['side_plank', 'dead_bug'],
    instructions: 'Stand side-on to a cable at chest height holding the handle at the sternum. Press the arms straight out and hold for a count, resisting the pull to rotate, then bring it back. Knees soft, ribs down, chin neutral — the spine should not move at all.',
    timed: false,
  },
  {
    id: 'cable_crunch', name: 'Kneeling Cable Crunch', equipment: 'cable',
    primaryMuscles: ['abs'], secondaryMuscles: ['obliques'], pattern: 'core_flexion',
    safetyTags: ['spinal_flexion'], substitutions: ['dead_bug', 'plank', 'pallof_press'],
    instructions: 'Kneel facing a high pulley with the rope held at the forehead. Curl the ribs towards the hips through a short range, keeping the hips still, and return slowly. Keep the elbows fixed and do not pull with the arms or drop the head. Skip when the lower back is irritated — dead bugs cover the same job without flexing the spine.',
    timed: false,
  },
  {
    id: 'reverse_crunch', name: 'Reverse Crunch', equipment: 'bodyweight',
    primaryMuscles: ['lower abs'], secondaryMuscles: ['hip flexors'], pattern: 'core_flexion',
    safetyTags: ['spinal_flexion'], substitutions: ['dead_bug', 'plank'],
    instructions: 'Lie on your back with knees bent at 90 degrees and hands beside you. Curl the knees towards the chest by lifting the tailbone a few centimetres, then lower slowly without arching the back. Keep the head on the floor throughout.',
    timed: false,
  },
  {
    id: 'hollow_hold', name: 'Hollow Hold (tucked)', equipment: 'bodyweight',
    primaryMuscles: ['abs', 'deep core'], secondaryMuscles: ['hip flexors'], pattern: 'core_anti_extension',
    safetyTags: ['spinal_flexion', 'neck_load'], substitutions: ['dead_bug', 'plank'],
    instructions: 'Lie on your back, press the lower back into the floor and lift the shoulders and bent knees slightly off the ground. Keep the chin tucked and the head heavy rather than straining the neck to hold it up — if the neck works harder than the abs, rest the head down and do dead bugs instead.',
    timed: true,
  },

  // ---------- Carries ----------
  {
    id: 'farmers_carry', name: "Farmer's Carry", equipment: 'dumbbell',
    primaryMuscles: ['grip', 'traps', 'core'], secondaryMuscles: ['glutes', 'calves'], pattern: 'carry',
    safetyTags: ['axial_load', 'neck_load'], substitutions: ['suitcase_carry', 'pallof_press', 'plank'],
    instructions: 'Pick the dumbbells up with a hip hinge and a flat back, then walk tall with the shoulders down and back and the ribs stacked over the hips. Short, quick steps; do not let the shoulders shrug up to the ears or the head drift forward. Use a load you can hold with an upright, relaxed neck.',
    timed: true,
  },
  {
    id: 'suitcase_carry', name: 'Suitcase Carry', equipment: 'dumbbell',
    primaryMuscles: ['obliques', 'grip'], secondaryMuscles: ['glute medius', 'traps'], pattern: 'carry',
    safetyTags: ['axial_load'], substitutions: ['pallof_press', 'side_plank'],
    instructions: 'Hold one dumbbell at your side and walk tall without letting the torso lean towards or away from it. Keep the shoulders level and the neck long. Lighter than a farmer carry — the goal is a still spine, not a heavy load.',
    timed: true,
  },

  // ---------- Conditioning ----------
  {
    id: 'stationary_bike', name: 'Stationary Bike', equipment: 'bike',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'calves'], pattern: 'cardio',
    safetyTags: [], substitutions: ['swim_easy', 'elliptical', 'incline_walk'],
    instructions: 'Set the seat so the knee has a slight bend at the bottom of the stroke — a low seat increases knee compression. Pedal at a comfortable cadence with moderate resistance; on flare-up days keep the resistance light and the cadence higher. Sit tall with relaxed shoulders and avoid hunching over the handlebars, which strains the neck and mid back.',
    timed: true,
  },
  {
    id: 'bike_intervals', name: 'Bike Intervals (low impact)', equipment: 'bike',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'cardiovascular'], pattern: 'cardio',
    safetyTags: [], substitutions: ['stationary_bike', 'swim_freestyle', 'elliptical'],
    instructions: 'After a 5-minute easy spin, alternate 30–60 seconds hard with 60–90 seconds easy for 6–10 rounds. Keep the seat height correct and increase cadence before resistance so the knees are not grinding. This is the default HIIT option — no impact, no running required.',
    timed: true,
  },
  {
    id: 'incline_walk', name: 'Treadmill Incline Walk', equipment: 'treadmill',
    primaryMuscles: ['glutes', 'calves'], secondaryMuscles: ['quads', 'hamstrings'], pattern: 'cardio',
    safetyTags: [], substitutions: ['stationary_bike', 'elliptical', 'swim_easy'],
    instructions: 'Walk at 5–6 km/h on a 6–12 percent incline without holding the rails, arms swinging naturally. Keep the stride short and land softly; look ahead, not down at the console, so the neck stays neutral. Reduce the incline or stop if the knees ache walking uphill, and avoid steep declines entirely.',
    timed: true,
  },
  {
    id: 'treadmill_walk', name: 'Treadmill Walk (flat)', equipment: 'treadmill',
    primaryMuscles: ['calves', 'glutes'], secondaryMuscles: ['quads'], pattern: 'cardio',
    safetyTags: [], substitutions: ['stationary_bike', 'elliptical'],
    instructions: 'Easy walking at a conversational pace for recovery or warm-up. Stand tall with a relaxed neck and let the arms swing. Add incline gradually only if the knees feel fine.',
    timed: true,
  },
  {
    id: 'treadmill_jog', name: 'Treadmill Jog', equipment: 'treadmill',
    primaryMuscles: ['quads', 'calves'], secondaryMuscles: ['glutes', 'hamstrings'], pattern: 'cardio',
    safetyTags: ['impact', 'knee_load'], substitutions: ['incline_walk', 'stationary_bike', 'elliptical', 'swim_freestyle'],
    instructions: 'Optional only. Jog at an easy pace with short, quick steps and a soft landing under the hips, on a 1 percent incline. Running is not required for fat loss; stop at the first sign of knee catching, swelling or sharp pain and switch to the bike or pool.',
    timed: true,
  },
  {
    id: 'stair_climber', name: 'Stair Climber', equipment: 'machine',
    primaryMuscles: ['glutes', 'quads'], secondaryMuscles: ['calves'], pattern: 'cardio',
    safetyTags: ['knee_load'], substitutions: ['incline_walk', 'stationary_bike', 'elliptical'],
    instructions: 'Use a slow to moderate step rate with the whole foot on each step and a light touch on the rails. Stand tall rather than leaning on the console. The repeated knee bending can irritate a sore meniscus — pick the bike or incline walk if the knees are tender.',
    timed: true,
  },
  {
    id: 'elliptical', name: 'Elliptical', equipment: 'elliptical',
    primaryMuscles: ['quads', 'glutes'], secondaryMuscles: ['hamstrings', 'arms'], pattern: 'cardio',
    safetyTags: [], substitutions: ['stationary_bike', 'incline_walk', 'swim_easy'],
    instructions: 'Stand tall with the whole foot on the pedals and a light grip on the handles. Keep the stride smooth at a moderate resistance; no impact reaches the knees. Avoid hunching the shoulders forward or looking down for long stretches.',
    timed: true,
  },

  // ---------- Pool ----------
  {
    id: 'swim_freestyle', name: 'Swim — Freestyle', equipment: 'pool',
    primaryMuscles: ['lats', 'shoulders'], secondaryMuscles: ['core', 'legs'], pattern: 'swim',
    safetyTags: [], substitutions: ['swim_easy', 'stationary_bike'],
    instructions: 'Swim continuous or interval freestyle at a steady effort, breathing to both sides to keep the neck balanced. Keep the head low and look at the bottom of the pool, rotating the body to breathe rather than lifting or twisting the neck. Kick from the hips with a relaxed, small flutter — a hard kick can irritate the knees.',
    timed: true,
  },
  {
    id: 'swim_easy', name: 'Swim — Easy / Recovery', equipment: 'pool',
    primaryMuscles: ['full body'], secondaryMuscles: [], pattern: 'swim',
    safetyTags: [], substitutions: ['swim_kickboard', 'stationary_bike'],
    instructions: 'Easy laps mixing freestyle and backstroke, or simply walking and floating in the water. Avoid breaststroke kick, which twists the knees, and keep the head aligned with the spine. This is the recovery-day default when the joints are sore.',
    timed: true,
  },
  {
    id: 'swim_kickboard', name: 'Swim — Kickboard (flutter kick)', equipment: 'pool',
    primaryMuscles: ['hip flexors', 'glutes'], secondaryMuscles: ['core'], pattern: 'swim',
    safetyTags: [], substitutions: ['swim_easy', 'stationary_bike'],
    instructions: 'Hold the board with straight arms and flutter kick from the hips with soft knees and pointed toes. Keep the face low with the neck relaxed rather than holding the head high, which loads the neck. Never use breaststroke kick with the board.',
    timed: true,
  },
]

export const EXERCISES: Exercise[] = [...UPPER, ...LOWER, ...CORE_AND_CARDIO]

export const EXERCISE_BY_ID: Record<string, Exercise> = Object.fromEntries(EXERCISES.map(e => [e.id, e]))

export function getExerciseById(id: string): Exercise | null {
  return EXERCISE_BY_ID[id] ?? null
}

/** Canonical ids referenced by planner templates (rowing_machine_none intentionally omitted — no rower). */
export const CANONICAL_EXERCISE_IDS: string[] = [
  'db_bench_press', 'incline_db_press', 'machine_chest_press', 'cable_fly', 'lat_pulldown', 'seated_cable_row',
  'chest_supported_db_row', 'one_arm_db_row', 'db_shoulder_press', 'machine_shoulder_press', 'lateral_raise', 'face_pull',
  'db_curl', 'cable_curl', 'triceps_pushdown', 'overhead_cable_triceps', 'leg_press', 'hack_squat', 'goblet_squat',
  'db_split_squat', 'hip_thrust', 'glute_bridge', 'db_rdl', 'lying_leg_curl', 'seated_leg_curl', 'leg_extension',
  'standing_calf_raise', 'seated_calf_raise', 'cable_pull_through', 'hip_abduction_machine', 'dead_bug', 'plank',
  'side_plank', 'pallof_press', 'cable_crunch', 'bird_dog', 'farmers_carry', 'stationary_bike', 'incline_walk',
  'swim_freestyle', 'swim_easy',
]

/** Spoken aliases for the voice parser (id -> lower-case phrases). Longer, more specific phrases win on ties. */
export const EXERCISE_ALIASES: Record<string, string[]> = {
  db_bench_press: ['bench', 'bench press', 'db bench', 'dumbbell bench', 'dumbbell bench press', 'flat bench', 'chest press dumbbell'],
  incline_db_press: ['incline press', 'incline bench', 'incline dumbbell press', 'incline db press', 'incline'],
  machine_chest_press: ['chest press', 'machine chest press', 'machine press', 'chest press machine'],
  db_floor_press: ['floor press', 'dumbbell floor press'],
  cable_fly: ['cable fly', 'cable flys', 'cable flyes', 'flys', 'flyes', 'fly', 'cable crossover', 'crossover'],
  pec_deck: ['pec deck', 'pec dec', 'machine fly', 'butterfly machine'],
  push_up: ['push up', 'push ups', 'pushup', 'pushups', 'press up', 'press ups'],
  incline_push_up: ['incline push up', 'incline push ups', 'incline pushup'],
  lat_pulldown: ['pulldown', 'pull down', 'lat pulldown', 'lat pull down', 'pulldowns', 'lats'],
  straight_arm_pulldown: ['straight arm pulldown', 'straight arm pull down', 'stiff arm pulldown'],
  assisted_pull_up: ['pull up', 'pull ups', 'pullup', 'pullups', 'assisted pull up', 'assisted pullup', 'chin up', 'chin ups'],
  db_pullover: ['pullover', 'pull over', 'dumbbell pullover'],
  seated_cable_row: ['row', 'rows', 'cable row', 'seated row', 'seated cable row', 'cable rows'],
  machine_row: ['machine row', 'chest pad row', 'row machine', 'hammer row'],
  chest_supported_db_row: ['chest supported row', 'supported row', 'incline row', 'chest supported dumbbell row'],
  one_arm_db_row: ['one arm row', 'single arm row', 'dumbbell row', 'db row', 'one arm dumbbell row', 'single arm dumbbell row'],
  bent_over_db_row: ['bent over row', 'bent over dumbbell row', 'bent row'],
  inverted_row: ['inverted row', 'inverted rows', 'body row', 'australian pull up'],
  db_shoulder_press: ['shoulder press', 'overhead press', 'ohp', 'dumbbell shoulder press', 'db shoulder press', 'press', 'military press', 'seated press'],
  machine_shoulder_press: ['machine shoulder press', 'shoulder press machine', 'machine overhead press'],
  arnold_press: ['arnold press', 'arnolds'],
  lateral_raise: ['lateral raise', 'lateral raises', 'side raise', 'side raises', 'laterals', 'lat raise', 'side laterals'],
  cable_lateral_raise: ['cable lateral raise', 'cable lateral', 'cable side raise'],
  db_front_raise: ['front raise', 'front raises'],
  face_pull: ['face pull', 'face pulls', 'facepull', 'facepulls'],
  rear_delt_fly: ['rear delt fly', 'rear delt flys', 'reverse fly', 'reverse flys', 'rear delts', 'rear delt raise'],
  reverse_pec_deck: ['reverse pec deck', 'rear delt machine', 'reverse fly machine'],
  band_pull_apart: ['band pull apart', 'band pull aparts', 'pull aparts', 'pull apart'],
  db_shrug: ['shrug', 'shrugs', 'dumbbell shrug', 'dumbbell shrugs'],
  db_curl: ['curl', 'curls', 'bicep curl', 'bicep curls', 'biceps curl', 'dumbbell curl', 'dumbbell curls', 'db curl', 'db curls'],
  hammer_curl: ['hammer curl', 'hammer curls', 'hammers'],
  incline_db_curl: ['incline curl', 'incline curls', 'incline dumbbell curl'],
  cable_curl: ['cable curl', 'cable curls', 'rope curl', 'bar curl'],
  preacher_curl_machine: ['preacher curl', 'preacher curls', 'machine curl', 'preacher'],
  triceps_pushdown: ['pushdown', 'pushdowns', 'push down', 'push downs', 'tricep pushdown', 'triceps pushdown', 'rope pushdown', 'tricep extension', 'triceps extension'],
  overhead_cable_triceps: ['overhead tricep', 'overhead triceps', 'overhead extension', 'overhead tricep extension', 'overhead triceps extension', 'overhead cable triceps'],
  db_lying_triceps_extension: ['skull crusher', 'skull crushers', 'skullcrusher', 'skullcrushers', 'lying tricep extension', 'lying triceps extension'],
  machine_triceps_extension: ['machine tricep extension', 'machine triceps extension', 'tricep machine', 'triceps machine'],
  db_kickback: ['kickback', 'kickbacks', 'tricep kickback', 'tricep kickbacks', 'triceps kickback'],
  leg_press: ['leg press', 'legpress', 'press machine legs'],
  single_leg_press: ['single leg press', 'one leg press', 'one legged press', 'single leg leg press'],
  hack_squat: ['hack squat', 'hack squats', 'hack'],
  goblet_squat: ['goblet squat', 'goblet squats', 'goblet', 'squat', 'squats', 'dumbbell squat'],
  db_split_squat: ['split squat', 'split squats', 'dumbbell split squat', 'static lunge'],
  reverse_lunge: ['reverse lunge', 'reverse lunges', 'lunge', 'lunges', 'backward lunge'],
  db_step_up: ['step up', 'step ups', 'stepup', 'stepups', 'dumbbell step up'],
  leg_extension: ['leg extension', 'leg extensions', 'quad extension', 'extensions'],
  hip_thrust: ['hip thrust', 'hip thrusts', 'thrusts', 'thrust', 'dumbbell hip thrust'],
  glute_bridge: ['glute bridge', 'glute bridges', 'bridge', 'bridges'],
  single_leg_glute_bridge: ['single leg bridge', 'single leg glute bridge', 'one leg bridge'],
  db_rdl: ['rdl', 'rdls', 'romanian deadlift', 'romanian deadlifts', 'deadlift', 'deadlifts', 'dumbbell rdl', 'dumbbell deadlift', 'stiff leg deadlift'],
  cable_pull_through: ['pull through', 'pull throughs', 'cable pull through', 'pullthrough'],
  back_extension_45: ['back extension', 'back extensions', 'hyperextension', 'hyperextensions', '45 degree back extension'],
  lying_leg_curl: ['leg curl', 'leg curls', 'lying leg curl', 'lying leg curls', 'hamstring curl', 'hamstring curls', 'prone leg curl'],
  seated_leg_curl: ['seated leg curl', 'seated leg curls', 'seated hamstring curl', 'seated curl'],
  swiss_ball_leg_curl: ['swiss ball curl', 'swiss ball leg curl', 'ball leg curl', 'stability ball curl', 'ball curl'],
  standing_calf_raise: ['calf raise', 'calf raises', 'calves', 'standing calf raise', 'standing calf raises', 'standing calves'],
  seated_calf_raise: ['seated calf raise', 'seated calf raises', 'seated calves', 'seated calf'],
  calf_press_leg_press: ['calf press', 'calf presses', 'leg press calf', 'leg press calves'],
  hip_abduction_machine: ['abduction', 'abductions', 'hip abduction', 'abductor', 'abductors', 'abductor machine', 'hip abduction machine'],
  hip_adduction_machine: ['adduction', 'adductions', 'hip adduction', 'adductor', 'adductors', 'adductor machine', 'inner thigh'],
  cable_hip_abduction: ['cable abduction', 'cable hip abduction'],
  side_lying_hip_abduction: ['side lying leg raise', 'side leg raise', 'side leg raises', 'clamshell'],
  glute_kickback_machine: ['glute kickback', 'glute kickbacks', 'cable kickback', 'kickback machine', 'donkey kick', 'donkey kicks'],
  dead_bug: ['dead bug', 'dead bugs', 'deadbug', 'deadbugs'],
  bird_dog: ['bird dog', 'bird dogs', 'birddog', 'birddogs'],
  plank: ['plank', 'planks', 'front plank', 'forearm plank'],
  side_plank: ['side plank', 'side planks'],
  pallof_press: ['pallof', 'pallof press', 'paloff', 'paloff press', 'anti rotation press'],
  cable_crunch: ['cable crunch', 'cable crunches', 'crunch', 'crunches', 'rope crunch', 'kneeling crunch'],
  reverse_crunch: ['reverse crunch', 'reverse crunches'],
  hollow_hold: ['hollow hold', 'hollow body', 'hollow body hold', 'hollow'],
  farmers_carry: ['farmers carry', "farmer's carry", 'farmer carry', 'farmers walk', 'farmer walk', "farmer's walk", 'carry', 'carries'],
  suitcase_carry: ['suitcase carry', 'suitcase carries', 'suitcase walk', 'one arm carry', 'single arm carry'],
  stationary_bike: ['bike', 'cycling', 'cycle', 'stationary bike', 'spin', 'spinning', 'exercise bike', 'bike ride'],
  bike_intervals: ['bike intervals', 'bike interval', 'bike hiit', 'hiit bike', 'intervals', 'interval bike', 'spin intervals'],
  incline_walk: ['incline walk', 'incline walking', 'treadmill incline', 'incline treadmill', 'uphill walk', 'walk incline', 'incline'],
  treadmill_walk: ['treadmill walk', 'walk', 'walking', 'treadmill', 'flat walk'],
  treadmill_jog: ['jog', 'jogging', 'run', 'running', 'treadmill run', 'treadmill jog'],
  stair_climber: ['stair climber', 'stairs', 'stairmaster', 'stair master', 'stepper', 'step mill'],
  elliptical: ['elliptical', 'cross trainer', 'crosstrainer', 'x trainer'],
  swim_freestyle: ['swim', 'swimming', 'freestyle', 'laps', 'swim laps', 'front crawl'],
  swim_easy: ['easy swim', 'recovery swim', 'easy laps', 'light swim', 'gentle swim'],
  swim_kickboard: ['kickboard', 'kick board', 'kicking', 'kick set', 'kick sets'],
}

function normalizeText(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function containsPhrase(haystack: string, phrase: string): boolean {
  const h = ' ' + haystack + ' '
  return h.includes(' ' + phrase + ' ')
}

/**
 * Fuzzy-match a spoken phrase to an exercise. Scans the transcript for the longest
 * alias (or exercise name) that appears as whole words; ties broken by specificity.
 * Returns null when nothing matches.
 */
export function findExerciseByAlias(text: string, list: Exercise[] = EXERCISES): Exercise | null {
  const t = normalizeText(text)
  if (!t) return null
  let best: { ex: Exercise, score: number } | null = null
  for (const ex of list) {
    const phrases = [normalizeText(ex.name), ...(EXERCISE_ALIASES[ex.id] ?? []).map(normalizeText)]
    for (const p of phrases) {
      if (!p) continue
      if (t === p || containsPhrase(t, p)) {
        // Prefer longer phrases; a whole-transcript match gets a small bonus.
        const score = p.length * 10 + (t === p ? 5 : 0) + (p.split(' ').length)
        if (!best || score > best.score) best = { ex, score }
      }
    }
  }
  return best ? best.ex : null
}
