/* js/config.js */
window.SUPABASE_URL = "https://iufqhpyegmuwicqpvjof.supabase.co";
window.SUPABASE_ANON_KEY = "sb_publishable_EFKrJOwQz16UILWPYJYN7g_wnf60ml0";


/* js/supabase.js */
let mafiaSupabaseClient = null;

function isSupabaseConfigReady() {
  return Boolean(
    window.SUPABASE_URL &&
      window.SUPABASE_ANON_KEY &&
      window.SUPABASE_URL !== "YOUR_SUPABASE_PROJECT_URL" &&
      window.SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY"
  );
}

function createMafiaSupabaseClient() {
  if (!window.supabase) {
    console.error("Supabase 연결 실패: Supabase CDN을 불러오지 못했습니다.");
    return null;
  }

  if (!isSupabaseConfigReady()) {
    console.error("Supabase 연결 실패: js/config.js에 Project URL과 공개용 키를 입력하세요.");
    return null;
  }

  return window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
}

mafiaSupabaseClient = createMafiaSupabaseClient();


/* js/constants.js */
const ROOM_STATUS = {
  WAITING: "waiting",
  STARTING: "starting",
  PLAYING: "playing",
  FINISHED: "finished",
};

const GAME_PHASE = {
  LOBBY: "lobby",
  ROLE_REVEAL: "role_reveal",
  FIRST_DAY: "first_day",
  DAY_AUGMENT: "day_augment",
  DAY_DISCUSSION: "day_discussion",
  DAY_VOTE: "day_vote",
  EXECUTION_RESULT: "execution_result",
  NIGHT_MAFIA_AUGMENT: "night_mafia_augment",
  NIGHT_MAFIA: "night_mafia",
  NIGHT_POLICE: "night_police",
  NIGHT_DOCTOR: "night_doctor",
  NIGHT_RESULT: "night_result",
  SECOND_DAY_READY: "second_day_ready",
  SECOND_NIGHT_READY: "second_night_ready",
  GAME_OVER: "game_over",
};

const GAME_TIME = {
  DAY_DISCUSSION_SECONDS: 60,
  DAY_VOTE_SECONDS: 30,
  EXECUTION_RESULT_SECONDS: 8,
  NIGHT_ACTION_SECONDS: 25,
  NIGHT_RESULT_SECONDS: 8,
};

const TEST_GAME_TIME = {
  DAY_DISCUSSION_SECONDS: 10,
  DAY_VOTE_SECONDS: 10,
  EXECUTION_RESULT_SECONDS: 5,
  NIGHT_ACTION_SECONDS: 10,
  NIGHT_RESULT_SECONDS: 5,
};

const ACTIVE_GAME_TIME = TEST_GAME_TIME;

const PLAYER_ROLE = {
  MAFIA: "mafia",
  CITIZEN: "citizen",
  POLICE: "police",
  DOCTOR: "doctor",
};

const ROLE_LABELS = {
  mafia: "마피아",
  citizen: "시민",
  police: "경찰",
  doctor: "의사",
};

const ROLE_DESCRIPTIONS = {
  mafia: "밤마다 제거할 플레이어를 선택합니다. 시민들 사이에 숨어 정체를 감추세요.",
  citizen: "토론과 투표를 통해 숨어 있는 마피아를 찾아내세요.",
  police: "밤마다 한 명을 조사해 마피아 여부를 확인할 수 있습니다.",
  doctor: "밤마다 한 명을 선택해 마피아의 공격으로부터 보호합니다.",
};

window.ROOM_STATUS = ROOM_STATUS;
window.GAME_PHASE = GAME_PHASE;
window.PLAYER_ROLE = PLAYER_ROLE;
window.ROLE_LABELS = ROLE_LABELS;
window.ROLE_DESCRIPTIONS = ROLE_DESCRIPTIONS;
window.GAME_TIME = GAME_TIME;
window.TEST_GAME_TIME = TEST_GAME_TIME;
window.ACTIVE_GAME_TIME = ACTIVE_GAME_TIME;


/* js/room.js */
const ROOM_CODE_CHARACTERS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const ROOM_CODE_LENGTH = 6;
const MAX_ROOM_CODE_ATTEMPTS = 10;
const PLAYER_ID_STORAGE_KEY = "augment_mafia_player_id";
const CURRENT_ROOM_STORAGE_KEY = "augment_mafia_current_room";

function validateNickname(rawNickname) {
  const nickname = rawNickname.trim().replace(/\s+/g, " ");

  if (!nickname) {
    return { isValid: false, message: "닉네임을 입력해주세요.", nickname: "" };
  }

  if (nickname.includes("\n") || nickname.includes("\r")) {
    return { isValid: false, message: "닉네임에는 줄바꿈을 사용할 수 없습니다.", nickname: "" };
  }

  if (nickname.length < 2) {
    return { isValid: false, message: "닉네임은 최소 2자 이상이어야 합니다.", nickname: "" };
  }

  if (nickname.length > 12) {
    return { isValid: false, message: "닉네임은 최대 12자까지 사용할 수 있습니다.", nickname: "" };
  }

  return { isValid: true, message: "", nickname };
}

function validateRoomCode(rawRoomCode) {
  const roomCode = rawRoomCode.trim().toUpperCase();

  if (!roomCode) {
    return { isValid: false, message: "방 코드를 입력해주세요.", roomCode: "" };
  }

  if (!/^[A-Z2-9]{6}$/.test(roomCode) || /[OIL01]/.test(roomCode)) {
    return { isValid: false, message: "방 코드는 혼동 문자를 제외한 6자리 대문자와 숫자입니다.", roomCode: "" };
  }

  return { isValid: true, message: "", roomCode };
}

function createUuid() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    throw new Error("현재 브라우저에서는 안전한 UUID를 만들 수 없습니다.");
  }

  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, function replaceUuidChar(character) {
    const randomValue = window.crypto.getRandomValues(new Uint8Array(1))[0];
    return (Number(character) ^ (randomValue & (15 >> (Number(character) / 4)))).toString(16);
  });
}

function savePlayerId(playerId) {
  try {
    window.sessionStorage.setItem(PLAYER_ID_STORAGE_KEY, playerId);
  } catch (error) {
    console.error("플레이어 ID 저장 실패:", error);
  }
}

function createPlayerId() {
  const playerId = createUuid();
  savePlayerId(playerId);
  return playerId;
}

function saveCurrentRoom(room, playerId, nickname) {
  try {
    window.sessionStorage.setItem(
      CURRENT_ROOM_STORAGE_KEY,
      JSON.stringify({
        roomId: room.id,
        roomCode: room.room_code,
        playerId,
        nickname,
      })
    );
  } catch (error) {
    console.error("방 정보 로컬 저장 실패:", error);
  }
}

function getSavedCurrentRoom() {
  try {
    const savedRoom = window.sessionStorage.getItem(CURRENT_ROOM_STORAGE_KEY);
    return savedRoom ? JSON.parse(savedRoom) : null;
  } catch (error) {
    console.error("방 정보 로컬 복구 실패:", error);
    return null;
  }
}

function generateRoomCode() {
  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    throw new Error("현재 브라우저에서는 안전한 방 코드를 만들 수 없습니다.");
  }

  let roomCode = "";
  const randomValues = new Uint8Array(ROOM_CODE_LENGTH);
  window.crypto.getRandomValues(randomValues);

  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    const randomIndex = randomValues[index] % ROOM_CODE_CHARACTERS.length;
    roomCode += ROOM_CODE_CHARACTERS[randomIndex];
  }

  return roomCode;
}

async function checkRoomCodeExists(roomCode) {
  const { data, error } = await mafiaSupabaseClient
    .from("rooms")
    .select("id")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (error) {
    console.error("방 코드 중복 확인 실패:", error);
    throw error;
  }

  return Boolean(data);
}

async function generateUniqueRoomCode() {
  for (let attempt = 0; attempt < MAX_ROOM_CODE_ATTEMPTS; attempt += 1) {
    const roomCode = generateRoomCode();
    const isDuplicate = await checkRoomCodeExists(roomCode);

    if (!isDuplicate) {
      return roomCode;
    }
  }

  throw new Error("방 코드 생성 실패: 중복되지 않는 코드를 만들지 못했습니다.");
}

async function deleteCreatedRoom(roomId) {
  const { error } = await mafiaSupabaseClient.from("rooms").delete().eq("id", roomId);

  if (error) {
    console.error("불완전한 방 정리 실패:", error);
  }
}

async function createRoomWithHost(nickname, authenticatedUserId) {
  if (!mafiaSupabaseClient) {
    throw new Error("Supabase 클라이언트가 준비되지 않았습니다.");
  }

  if (!authenticatedUserId) {
    throw new Error("로그인이 필요합니다.");
  }

  const playerId = createUuid();
  savePlayerId(playerId);
  const roomId = createUuid();
  const roomCode = await generateUniqueRoomCode();

  const roomPayload = {
    id: roomId,
    room_code: roomCode,
    host_player_id: playerId,
    host_user_id: authenticatedUserId,
    status: ROOM_STATUS.WAITING,
    phase: GAME_PHASE.LOBBY,
    current_players: 1,
    max_players: 8,
  };

  const { data: room, error: roomError } = await mafiaSupabaseClient
    .from("rooms")
    .insert(roomPayload)
    .select()
    .single();

  if (roomError) {
    console.error("방 데이터 저장 실패:", roomError);
    throw roomError;
  }

  const playerPayload = {
    id: playerId,
    user_id: authenticatedUserId,
    room_id: room.id,
    nickname,
    is_host: true,
    is_ready: false,
    is_alive: true,
    has_seen_role: false,
  };

  const { data: player, error: playerError } = await mafiaSupabaseClient
    .from("room_players")
    .insert(playerPayload)
    .select()
    .single();

  if (playerError) {
    console.error("플레이어 데이터 저장 실패:", playerError);
    await deleteCreatedRoom(room.id);
    throw playerError;
  }

  saveCurrentRoom(room, playerId, nickname);
  return { room, player };
}

async function joinRoomByCode(roomCode, nickname, authenticatedUserId) {
  if (!mafiaSupabaseClient) {
    throw new Error("Supabase 클라이언트가 준비되지 않았습니다.");
  }

  if (!authenticatedUserId) {
    throw new Error("로그인이 필요합니다.");
  }

  const { data: room, error: roomError } = await mafiaSupabaseClient
    .from("rooms")
    .select("*")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (roomError) {
    console.error("방 조회 실패:", roomError);
    throw roomError;
  }

  if (!room) {
    throw new Error("존재하지 않는 방입니다.");
  }

  if (room.status !== ROOM_STATUS.WAITING) {
    throw new Error("이미 시작된 방에는 참가할 수 없습니다.");
  }

  const { data: players, error: playersError } = await mafiaSupabaseClient
    .from("room_players")
    .select("id, nickname")
    .eq("room_id", room.id);

  if (playersError) {
    console.error("플레이어 목록 조회 실패:", playersError);
    throw playersError;
  }

  if ((players || []).length >= 8) {
    throw new Error("방이 가득 찼습니다.");
  }

  const hasSameNickname = (players || []).some(function compareNickname(player) {
    return player.nickname.trim().toLowerCase() === nickname.trim().toLowerCase();
  });

  if (hasSameNickname) {
    throw new Error("같은 방에서 이미 사용 중인 닉네임입니다.");
  }

  const playerId = createUuid();
  savePlayerId(playerId);
  const { data: player, error: insertError } = await mafiaSupabaseClient
    .from("room_players")
    .insert({
      id: playerId,
      user_id: authenticatedUserId,
      room_id: room.id,
      nickname,
      is_host: false,
      is_ready: false,
      is_alive: true,
      has_seen_role: false,
    })
    .select()
    .single();

  if (insertError) {
    console.error("방 참가 실패:", insertError);
    throw insertError;
  }

  await updateRoomPlayerCount(room.id);
  saveCurrentRoom(room, playerId, nickname);
  return { room, player };
}

async function updateRoomPlayerCount(roomId) {
  const { count, error: countError } = await mafiaSupabaseClient
    .from("room_players")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId);

  if (countError) {
    console.error("현재 인원 계산 실패:", countError);
    throw countError;
  }

  const { error: updateError } = await mafiaSupabaseClient
    .from("rooms")
    .update({ current_players: count || 0 })
    .eq("id", roomId);

  if (updateError) {
    console.error("현재 인원 업데이트 실패:", updateError);
    throw updateError;
  }
}


/* js/role-system.js */
function getRoleComposition(playerCount) {
  const roleMap = {
    5: [PLAYER_ROLE.MAFIA, PLAYER_ROLE.POLICE, PLAYER_ROLE.DOCTOR, PLAYER_ROLE.CITIZEN, PLAYER_ROLE.CITIZEN],
    6: [
      PLAYER_ROLE.MAFIA,
      PLAYER_ROLE.POLICE,
      PLAYER_ROLE.DOCTOR,
      PLAYER_ROLE.CITIZEN,
      PLAYER_ROLE.CITIZEN,
      PLAYER_ROLE.CITIZEN,
    ],
    7: [
      PLAYER_ROLE.MAFIA,
      PLAYER_ROLE.MAFIA,
      PLAYER_ROLE.POLICE,
      PLAYER_ROLE.DOCTOR,
      PLAYER_ROLE.CITIZEN,
      PLAYER_ROLE.CITIZEN,
      PLAYER_ROLE.CITIZEN,
    ],
    8: [
      PLAYER_ROLE.MAFIA,
      PLAYER_ROLE.MAFIA,
      PLAYER_ROLE.POLICE,
      PLAYER_ROLE.DOCTOR,
      PLAYER_ROLE.CITIZEN,
      PLAYER_ROLE.CITIZEN,
      PLAYER_ROLE.CITIZEN,
      PLAYER_ROLE.CITIZEN,
    ],
  };

  if (!roleMap[playerCount]) {
    throw new Error("역할 구성은 5명부터 8명까지만 지원합니다.");
  }

  return roleMap[playerCount];
}

function getSecureRandomIndex(maxExclusive) {
  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    throw new Error("이 브라우저에서는 안전한 무작위 값을 만들 수 없습니다.");
  }

  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] % maxExclusive;
}

function shuffleArray(items) {
  const result = items.slice();

  for (let index = result.length - 1; index > 0; index -= 1) {
    const randomIndex = getSecureRandomIndex(index + 1);
    const previousItem = result[index];
    result[index] = result[randomIndex];
    result[randomIndex] = previousItem;
  }

  return result;
}

function assignRoles(players) {
  const orderedPlayers = shuffleArray(players);
  const shuffledRoles = shuffleArray(getRoleComposition(orderedPlayers.length));
  const playerOrders = shuffleArray(
    orderedPlayers.map(function createOrderValue(_, index) {
      return index + 1;
    })
  );

  return orderedPlayers.map(function createAssignment(player, index) {
    return {
      player_id: player.id,
      role: shuffledRoles[index],
      player_order: playerOrders[index],
    };
  });
}

function validateRoleAssignments(players, assignments) {
  if (players.length !== assignments.length) {
    throw new Error("플레이어 수와 역할 수가 일치하지 않습니다.");
  }

  const assignedPlayerIds = new Set();
  const roleCounts = {
    mafia: 0,
    citizen: 0,
    police: 0,
    doctor: 0,
  };

  assignments.forEach(function countAssignment(assignment) {
    assignedPlayerIds.add(assignment.player_id);
    roleCounts[assignment.role] += 1;
  });

  if (assignedPlayerIds.size !== players.length) {
    throw new Error("역할을 받지 못했거나 중복 배정된 플레이어가 있습니다.");
  }

  if (roleCounts.police !== 1 || roleCounts.doctor !== 1) {
    throw new Error("경찰과 의사는 각각 1명이어야 합니다.");
  }

  if ((players.length <= 6 && roleCounts.mafia !== 1) || (players.length >= 7 && roleCounts.mafia !== 2)) {
    throw new Error("인원수에 맞는 마피아 수가 아닙니다.");
  }
}


/* js/augment-data.js */
const AUGMENT_RARITY_LABELS = {
  silver: "실버",
  gold: "골드",
  prism: "프리즘",
};

const AUGMENT_DATA = {
  citizen: {
    silver: [
      { id: "citizen_silver_01", name: "침착한 판단", rarity: "silver", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_silver_02", name: "조용한 관찰", rarity: "silver", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_silver_03", name: "흔들림 없는 말", rarity: "silver", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_silver_04", name: "마지막 질문", rarity: "silver", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_silver_05", name: "기억의 조각", rarity: "silver", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
    ],
    gold: [
      { id: "citizen_gold_01", name: "확신의 단서", rarity: "gold", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_gold_02", name: "날카로운 추리", rarity: "gold", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_gold_03", name: "공동의 의심", rarity: "gold", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_gold_04", name: "밝혀진 흔적", rarity: "gold", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_gold_05", name: "정리된 증언", rarity: "gold", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
    ],
    prism: [
      { id: "citizen_prism_01", name: "완전한 추론", rarity: "prism", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_prism_02", name: "흐름의 반전", rarity: "prism", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_prism_03", name: "숨은 연결", rarity: "prism", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_prism_04", name: "분명한 결론", rarity: "prism", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "citizen_prism_05", name: "진실의 방향", rarity: "prism", team: "citizen", description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
    ],
  },
  mafia: {
    silver: [
      { id: "mafia_silver_01", name: "낮은 목소리", rarity: "silver", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_silver_02", name: "가려진 동선", rarity: "silver", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_silver_03", name: "흐린 기억", rarity: "silver", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_silver_04", name: "짧은 침묵", rarity: "silver", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_silver_05", name: "남겨진 틈", rarity: "silver", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
    ],
    gold: [
      { id: "mafia_gold_01", name: "대담한 계획", rarity: "gold", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_gold_02", name: "거짓 단서", rarity: "gold", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_gold_03", name: "침착한 거짓말", rarity: "gold", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_gold_04", name: "분산된 의심", rarity: "gold", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_gold_05", name: "조작된 흐름", rarity: "gold", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
    ],
    prism: [
      { id: "mafia_prism_01", name: "완벽한 은폐", rarity: "prism", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_prism_02", name: "결정적 혼선", rarity: "prism", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_prism_03", name: "깊은 위장", rarity: "prism", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_prism_04", name: "사라진 흔적", rarity: "prism", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
      { id: "mafia_prism_05", name: "끝없는 의심", rarity: "prism", team: "mafia", is_fake: false, description: "임시 증강입니다. 실제 효과는 이후 추가됩니다.", image: null },
    ],
  },
  fake: {
    silver: [
      { id: "fake_silver_01", name: "차분한 기록", rarity: "silver", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_silver_02", name: "늦은 확신", rarity: "silver", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_silver_03", name: "낡은 단서", rarity: "silver", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_silver_04", name: "조심스러운 발언", rarity: "silver", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_silver_05", name: "불완전한 추리", rarity: "silver", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
    ],
    gold: [
      { id: "fake_gold_01", name: "날카로운 관찰", rarity: "gold", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_gold_02", name: "확실한 기록", rarity: "gold", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_gold_03", name: "흔들린 증언", rarity: "gold", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_gold_04", name: "겹쳐진 단서", rarity: "gold", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_gold_05", name: "마지막 관찰", rarity: "gold", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
    ],
    prism: [
      { id: "fake_prism_01", name: "완성된 추리", rarity: "prism", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_prism_02", name: "분명한 시선", rarity: "prism", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_prism_03", name: "숨겨진 결론", rarity: "prism", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_prism_04", name: "확정된 흐름", rarity: "prism", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
      { id: "fake_prism_05", name: "조용한 반전", rarity: "prism", team: "fake", is_fake: true, description: "실제 효과가 없는 가짜 증강입니다.", image: null },
    ],
  },
};

window.AUGMENT_RARITY_LABELS = AUGMENT_RARITY_LABELS;
window.AUGMENT_DATA = AUGMENT_DATA;


/* js/augment-system.js */
const AUGMENT_RARITY_CHANCE = {
  silver: 0.3,
  gold: 0.5,
  prism: 0.2,
};

function generateRandomValue() {
  if (!window.crypto || typeof window.crypto.getRandomValues !== "function") {
    throw new Error("안전한 무작위 값을 만들 수 없습니다.");
  }

  const values = new Uint32Array(1);
  window.crypto.getRandomValues(values);
  return values[0] / 4294967296;
}

function rollAugmentRarity(randomValue) {
  let rolledRarity = "prism";

  if (randomValue < AUGMENT_RARITY_CHANCE.silver) {
    rolledRarity = "silver";
  } else if (randomValue < AUGMENT_RARITY_CHANCE.silver + AUGMENT_RARITY_CHANCE.gold) {
    rolledRarity = "gold";
  }

  // 이번 규칙: 등급은 한 번만 뽑고 3장 모두 같은 등급이다.
  // 프리즘이 뽑힌 경우에도 이번 단계에서는 실버 3장으로 표시한다.
  return rolledRarity === "prism" ? "silver" : rolledRarity;
}

function getOfferTypeForPlayer(room, player) {
  if (room.phase === GAME_PHASE.DAY_AUGMENT) {
    return player.role === PLAYER_ROLE.MAFIA ? "mafia_fake" : "citizen_real";
  }

  if (room.phase === GAME_PHASE.NIGHT_MAFIA_AUGMENT && player.role === PLAYER_ROLE.MAFIA) {
    return "mafia_real";
  }

  return "";
}

function getAugmentTeamForOfferType(offerType) {
  if (offerType === "mafia_fake") {
    return "fake";
  }

  if (offerType === "mafia_real") {
    return "mafia";
  }

  return "citizen";
}

function findAugmentById(augmentId) {
  const teams = Object.keys(AUGMENT_DATA);

  for (let teamIndex = 0; teamIndex < teams.length; teamIndex += 1) {
    const team = teams[teamIndex];
    const rarities = Object.keys(AUGMENT_DATA[team]);

    for (let rarityIndex = 0; rarityIndex < rarities.length; rarityIndex += 1) {
      const rarity = rarities[rarityIndex];
      const found = AUGMENT_DATA[team][rarity].find(function matchAugment(augment) {
        return augment.id === augmentId;
      });

      if (found) {
        return found;
      }
    }
  }

  return null;
}

async function loadOwnedAugments(roomId, playerId) {
  const { data, error } = await mafiaSupabaseClient
    .from("player_augments")
    .select("*")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .order("slot_number", { ascending: true });

  if (error) {
    console.error("보유 증강 조회 실패:", error);
    throw error;
  }

  return data || [];
}

async function loadFakeAugments(roomId, playerId) {
  const { data, error } = await mafiaSupabaseClient
    .from("player_fake_augments")
    .select("*")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("가짜 증강 조회 실패:", error);
    throw error;
  }

  return data || [];
}

async function loadExistingOffer(roomId, playerId, dayNumber, offerType) {
  const { data, error } = await mafiaSupabaseClient
    .from("augment_offers")
    .select("*")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .eq("day_number", dayNumber)
    .eq("offer_type", offerType)
    .maybeSingle();

  if (error) {
    console.error("증강 제안 조회 실패:", error);
    throw error;
  }

  return data;
}

function pickUniqueAugments(pool, count) {
  const result = [];
  const candidates = pool.slice();

  while (result.length < count && candidates.length > 0) {
    const index = Math.floor(generateRandomValue() * candidates.length);
    const picked = candidates.splice(index, 1)[0];

    if (!result.some(function hasSameAugment(augment) { return augment.id === picked.id; })) {
      result.push(picked);
    }
  }

  if (result.length < count) {
    throw new Error("사용 가능한 증강이 부족합니다.");
  }

  return result;
}

async function createAugmentOffer(room, player, offerType) {
  const existingOffer = await loadExistingOffer(room.id, player.id, room.day_number, offerType);

  if (existingOffer) {
    return existingOffer;
  }

  const rarity = rollAugmentRarity(generateRandomValue());
  const team = getAugmentTeamForOfferType(offerType);
  const ownedAugments = offerType === "mafia_fake" ? await loadFakeAugments(room.id, player.id) : await loadOwnedAugments(room.id, player.id);
  const ownedIds = new Set(ownedAugments.map(function getOwnedId(owned) { return owned.augment_id; }));
  const pool = AUGMENT_DATA[team][rarity].filter(function excludeOwned(augment) {
    return !ownedIds.has(augment.id);
  });
  const augments = pickUniqueAugments(pool, 3);

  const { data, error } = await mafiaSupabaseClient
    .from("augment_offers")
    .insert({
      room_id: room.id,
      player_id: player.id,
      day_number: room.day_number,
      offer_type: offerType,
      augment_ids: augments.map(function getId(augment) { return augment.id; }),
    })
    .select()
    .single();

  if (error) {
    console.error("증강 제안 저장 실패:", error);
    throw error;
  }

  return data;
}

async function getOrCreateAugmentOffer(room, player) {
  const offerType = getOfferTypeForPlayer(room, player);

  if (!offerType) {
    return null;
  }

  return createAugmentOffer(room, player, offerType);
}

async function confirmAugmentSelection(roomId, playerId, offerId, augmentId, replaceSlotNumber) {
  return callGameRpc("select_augment", {
    target_room_id: roomId,
    target_player_id: playerId,
    target_offer_id: offerId,
    target_augment_id: augmentId,
    replace_slot_number: replaceSlotNumber || null,
  });
}

window.AUGMENT_RARITY_CHANCE = AUGMENT_RARITY_CHANCE;


/* js/game-state.js */
let sharedRoomSubscription = null;
let sharedPlayerSubscription = null;

function getSavedPlayerId() {
  try {
    return window.sessionStorage.getItem(PLAYER_ID_STORAGE_KEY);
  } catch (error) {
    console.error("플레이어 ID 읽기 실패:", error);
    return "";
  }
}

function getCurrentRoomCode() {
  const params = new URLSearchParams(window.location.search);
  const roomCodeFromUrl = params.get("room");

  if (roomCodeFromUrl) {
    return roomCodeFromUrl.trim().toUpperCase();
  }

  const savedRoom = getSavedCurrentRoom();
  return savedRoom && savedRoom.roomCode ? savedRoom.roomCode : "";
}

async function fetchRoomByCode(roomCode) {
  const { data, error } = await mafiaSupabaseClient
    .from("rooms")
    .select("*")
    .eq("room_code", roomCode)
    .maybeSingle();

  if (error) {
    console.error("방 조회 실패:", error);
    throw error;
  }

  return data;
}

async function fetchPlayersByRoomId(roomId) {
  const { data, error } = await mafiaSupabaseClient
    .from("room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });

  if (error) {
    console.error("플레이어 조회 실패:", error);
    throw error;
  }

  return data || [];
}

function findCurrentPlayer(players) {
  const playerId = getSavedPlayerId();
  return players.find(function findById(player) {
    return player.id === playerId;
  });
}

function isHostPlayer(room, player) {
  return Boolean(room && player && room.host_player_id === player.id);
}

function canStartGame(room, players, player) {
  if (!room) {
    return { canStart: false, message: "방 정보를 찾을 수 없습니다." };
  }

  if (room.status !== ROOM_STATUS.WAITING) {
    return { canStart: false, message: "이미 게임이 시작되었습니다." };
  }

  if (!isHostPlayer(room, player)) {
    return { canStart: false, message: "방장만 게임을 시작할 수 있습니다." };
  }

  if (players.length < 5) {
    return { canStart: false, message: "최소 5명이 필요합니다." };
  }

  if (players.length > 8) {
    return { canStart: false, message: "최대 8명까지만 플레이할 수 있습니다." };
  }

  const notReadyPlayers = players.filter(function checkReady(targetPlayer) {
    return !targetPlayer.is_host && !targetPlayer.is_ready;
  });

  if (notReadyPlayers.length > 0) {
    return { canStart: false, message: "모든 플레이어가 준비해야 합니다." };
  }

  if (!player) {
    return { canStart: false, message: "현재 플레이어가 이 방에 없습니다." };
  }

  return { canStart: true, message: "게임을 시작할 수 있습니다." };
}

async function toggleReady(roomId, player) {
  if (!player) {
    throw new Error("현재 플레이어 정보를 찾을 수 없습니다.");
  }

  if (player.is_host) {
    return player;
  }

  const { data, error } = await mafiaSupabaseClient
    .from("room_players")
    .update({ is_ready: !player.is_ready })
    .eq("id", player.id)
    .eq("room_id", roomId)
    .select()
    .single();

  if (error) {
    console.error("준비 상태 변경 실패:", error);
    throw error;
  }

  return data;
}

async function startGame(room, players, player) {
  const validation = canStartGame(room, players, player);

  if (!validation.canStart) {
    throw new Error(validation.message);
  }

  const latestRoom = await fetchRoomByCode(room.room_code);

  if (!latestRoom || latestRoom.status !== ROOM_STATUS.WAITING) {
    throw new Error("이미 게임이 시작되었습니다.");
  }

  const latestPlayers = await fetchPlayersByRoomId(room.id);
  const latestPlayer = latestPlayers.find(function findPlayer(targetPlayer) {
    return targetPlayer.id === player.id;
  });
  const latestValidation = canStartGame(latestRoom, latestPlayers, latestPlayer);

  if (!latestValidation.canStart) {
    throw new Error(latestValidation.message);
  }

  const assignments = assignRoles(latestPlayers);
  validateRoleAssignments(latestPlayers, assignments);

  const { error } = await mafiaSupabaseClient.rpc("start_mafia_game", {
    target_room_id: room.id,
    requester_player_id: player.id,
    role_assignments: assignments,
  });

  if (error) {
    console.error("게임 시작 RPC 실패:", error);
    throw error;
  }
}

async function markRoleAsSeen(roomId, playerId) {
  const { error } = await mafiaSupabaseClient.rpc("mark_role_seen_and_transition", {
    target_room_id: roomId,
    target_player_id: playerId,
  });

  if (error) {
    console.error("직업 확인 완료 실패:", error);
    throw error;
  }
}

function cleanupSubscriptions() {
  if (sharedRoomSubscription) {
    mafiaSupabaseClient.removeChannel(sharedRoomSubscription);
    sharedRoomSubscription = null;
  }

  if (sharedPlayerSubscription) {
    mafiaSupabaseClient.removeChannel(sharedPlayerSubscription);
    sharedPlayerSubscription = null;
  }
}

function subscribeToRoomChanges(roomId, callback) {
  if (sharedRoomSubscription) {
    return;
  }

  sharedRoomSubscription = mafiaSupabaseClient
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      callback
    )
    .subscribe(function handleStatus(status) {
      if (status === "CHANNEL_ERROR") {
        console.error("방 Realtime 구독 실패");
      }
    });
}

function subscribeToPlayerChanges(roomId, callback) {
  if (sharedPlayerSubscription) {
    return;
  }

  sharedPlayerSubscription = mafiaSupabaseClient
    .channel(`room_players:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
      callback
    )
    .subscribe(function handleStatus(status) {
      if (status === "CHANNEL_ERROR") {
        console.error("플레이어 Realtime 구독 실패");
      }
    });
}

function redirectByGameState(room) {
  const roomCode = room ? room.room_code : getCurrentRoomCode();

  if (!room || !roomCode) {
    window.location.href = "./index.html";
    return;
  }

  const encodedRoomCode = encodeURIComponent(roomCode);
  const isLobbyPage = window.location.pathname.endsWith("lobby.html");
  const isGamePage = window.location.pathname.endsWith("game.html");

  if (room.status === ROOM_STATUS.WAITING && !isLobbyPage) {
    window.location.href = `./lobby.html?room=${encodedRoomCode}`;
    return;
  }

  if (
    room.status === ROOM_STATUS.STARTING &&
    room.phase === GAME_PHASE.ROLE_REVEAL &&
    !isGamePage
  ) {
    window.location.href = `./game.html?room=${encodedRoomCode}`;
    return;
  }

  if (room.status === ROOM_STATUS.PLAYING && !isGamePage) {
    window.location.href = `./game.html?room=${encodedRoomCode}`;
  }
}

function getPhaseDurationSeconds(phase) {
  if (phase === GAME_PHASE.DAY_DISCUSSION) {
    return ACTIVE_GAME_TIME.DAY_DISCUSSION_SECONDS;
  }

  if (phase === GAME_PHASE.DAY_VOTE) {
    return ACTIVE_GAME_TIME.DAY_VOTE_SECONDS;
  }

  if (phase === GAME_PHASE.EXECUTION_RESULT) {
    return ACTIVE_GAME_TIME.EXECUTION_RESULT_SECONDS;
  }

  if (
    phase === GAME_PHASE.NIGHT_MAFIA ||
    phase === GAME_PHASE.NIGHT_POLICE ||
    phase === GAME_PHASE.NIGHT_DOCTOR
  ) {
    return ACTIVE_GAME_TIME.NIGHT_ACTION_SECONDS;
  }

  if (phase === GAME_PHASE.NIGHT_RESULT) {
    return ACTIVE_GAME_TIME.NIGHT_RESULT_SECONDS;
  }

  return 0;
}

async function callGameRpc(functionName, parameters) {
  const { data, error } = await mafiaSupabaseClient.rpc(functionName, parameters);

  if (error) {
    console.error(`${functionName} 실패:`, error);
    throw error;
  }

  return data;
}

async function requestPhaseTransition(roomId, playerId) {
  return callGameRpc("request_phase_transition", {
    target_room_id: roomId,
    requester_player_id: playerId,
  });
}

async function submitVote(roomId, voterId, targetId) {
  return callGameRpc("submit_vote", {
    target_room_id: roomId,
    voter_player_id: voterId,
    target_player_id: targetId,
  });
}

async function submitNightAction(roomId, playerId, role, targetId) {
  return callGameRpc("submit_night_action", {
    target_room_id: roomId,
    acting_player_id: playerId,
    acting_role: role,
    target_player_id: targetId,
  });
}

async function getVoteProgress(roomId, dayNumber) {
  const alivePlayers = await fetchPlayersByRoomId(roomId);
  const aliveVoteCount = alivePlayers.filter(function canVote(player) {
    return player.is_alive && player.can_vote;
  }).length;

  const votedCount = alivePlayers.filter(function hasVoted(player) {
    return player.is_alive && player.can_vote && player.has_voted;
  }).length;

  return {
    votedCount,
    totalCount: aliveVoteCount,
    dayNumber,
  };
}


/* js/app.js */
if (document.querySelector("#authForm")) {
  console.log('AUGMENT MAFIA home page loaded');
const APP_SESSION_STORAGE_KEY = "augment_mafia_app_session";

const homeElements = {
  connectionStatus: document.querySelector("#connectionStatus"),
  authStatus: document.querySelector("#authStatus"),
  authForm: document.querySelector("#authForm"),
  authUsernameInput: document.querySelector("#authUsernameInput"),
  authPasswordInput: document.querySelector("#authPasswordInput"),
  loginButton: document.querySelector("#loginButton"),
  signupButton: document.querySelector("#signupButton"),
  logoutButton: document.querySelector("#logoutButton"),
  authMessage: document.querySelector("#authMessage"),
  createRoomForm: document.querySelector("#createRoomForm"),
  createNicknameInput: document.querySelector("#createNicknameInput"),
  createRoomButton: document.querySelector("#createRoomButton"),
  createRoomButtonLabel: document.querySelector("#createRoomButton .button-label"),
  formMessage: document.querySelector("#formMessage"),
  joinRoomForm: document.querySelector("#joinRoomForm"),
  joinNicknameInput: document.querySelector("#joinNicknameInput"),
  roomCodeInput: document.querySelector("#roomCodeInput"),
  joinRoomButton: document.querySelector("#joinRoomButton"),
  joinRoomButtonLabel: document.querySelector("#joinRoomButton .button-label"),
  joinMessage: document.querySelector("#joinMessage"),
};

let appSessionToken = getStoredSessionToken();
let isAuthLoading = false;
let isCreatingRoom = false;
let isJoiningRoom = false;
let currentAuthUser = null;

function getStoredSessionToken() {
  try {
    return window.sessionStorage.getItem(APP_SESSION_STORAGE_KEY) || "";
  } catch (error) {
    console.error("세션 토큰 읽기 실패:", error);
    return "";
  }
}

function saveSessionToken(token) {
  appSessionToken = token;

  try {
    window.sessionStorage.setItem(APP_SESSION_STORAGE_KEY, token);
  } catch (error) {
    console.error("세션 토큰 저장 실패:", error);
  }
}

function clearSessionToken() {
  appSessionToken = "";

  try {
    window.sessionStorage.removeItem(APP_SESSION_STORAGE_KEY);
  } catch (error) {
    console.error("세션 토큰 삭제 실패:", error);
  }
}

async function callMafiaRpc(name, args) {
  if (!mafiaSupabaseClient) {
    throw new Error("Supabase 연결을 먼저 확인해주세요.");
  }

  const { data, error } = await mafiaSupabaseClient.rpc(name, args || {});

  if (error) {
    throw new Error(error.message || "요청 처리 중 문제가 발생했습니다.");
  }

  return data;
}

function setConnectionStatus(message, type) {
  homeElements.connectionStatus.textContent = message;
  homeElements.connectionStatus.classList.remove("is-success", "is-error");

  if (type) {
    homeElements.connectionStatus.classList.add(`is-${type}`);
  }
}

function setMessage(element, message, type) {
  element.textContent = message;
  element.classList.remove("is-success", "is-error");

  if (type) {
    element.classList.add(`is-${type}`);
  }
}

function getUserDisplayName(user) {
  if (!user) {
    return "";
  }

  return user.username || "로그인한 사용자";
}

function setAuthLoading(isLoading) {
  isAuthLoading = isLoading;
  homeElements.authUsernameInput.disabled = isLoading;
  homeElements.authPasswordInput.disabled = isLoading;
  renderAuthState();
}

function renderAuthState() {
  const isLoggedIn = Boolean(currentAuthUser);
  const isBusy = isAuthLoading || isCreatingRoom || isJoiningRoom;
  const isSupabaseReady = Boolean(mafiaSupabaseClient);

  homeElements.authStatus.textContent = isLoggedIn
    ? `${getUserDisplayName(currentAuthUser)} 계정으로 로그인됨`
    : isSupabaseReady
      ? "아이디로 로그인 후 방을 만들거나 참가할 수 있습니다."
      : "Supabase 연결을 먼저 확인해주세요.";

  homeElements.authForm.hidden = isLoggedIn;
  homeElements.logoutButton.hidden = !isLoggedIn;
  homeElements.logoutButton.disabled = isBusy;
  homeElements.loginButton.disabled = !isSupabaseReady || isAuthLoading;
  homeElements.signupButton.disabled = !isSupabaseReady || isAuthLoading;
  homeElements.createRoomButton.disabled = !isLoggedIn || isBusy;
  homeElements.joinRoomButton.disabled = !isLoggedIn || isBusy;
}

function setCreateRoomLoading(isLoading) {
  isCreatingRoom = isLoading;
  homeElements.createNicknameInput.disabled = isLoading || isJoiningRoom;
  homeElements.joinNicknameInput.disabled = isLoading || isJoiningRoom;
  homeElements.roomCodeInput.disabled = isLoading || isJoiningRoom;
  homeElements.createRoomButton.classList.toggle("is-loading", isLoading);
  homeElements.createRoomButtonLabel.textContent = isLoading ? "방 만드는 중..." : "방 만들기";
  renderAuthState();
}

function setJoinRoomLoading(isLoading) {
  isJoiningRoom = isLoading;
  homeElements.createNicknameInput.disabled = isLoading || isCreatingRoom;
  homeElements.joinNicknameInput.disabled = isLoading || isCreatingRoom;
  homeElements.roomCodeInput.disabled = isLoading || isCreatingRoom;
  homeElements.joinRoomButtonLabel.textContent = isLoading ? "참가 중..." : "참가하기";
  renderAuthState();
}

function getAuthFormValues() {
  return {
    username: homeElements.authUsernameInput.value.trim(),
    password: homeElements.authPasswordInput.value,
  };
}

function validateAuthForm() {
  const values = getAuthFormValues();

  if (!values.username) {
    return { isValid: false, message: "아이디를 입력해주세요.", values };
  }

  if (values.username.length < 2 || values.username.length > 20) {
    return { isValid: false, message: "아이디는 2자 이상 20자 이하로 입력해주세요.", values };
  }

  if (!values.password || values.password.length < 6) {
    return { isValid: false, message: "비밀번호는 최소 6자 이상이어야 합니다.", values };
  }

  return { isValid: true, message: "", values };
}

function getFriendlyAuthError(error) {
  const message = String(error.message || "");

  if (message.includes("username already exists")) {
    return "이미 사용 중인 아이디입니다.";
  }

  if (message.includes("invalid login")) {
    return "아이디 또는 비밀번호를 확인해주세요.";
  }

  if (message.includes("password must be at least 6 characters")) {
    return "비밀번호는 최소 6자 이상이어야 합니다.";
  }

  if (message.includes("username and password required")) {
    return "아이디와 비밀번호를 입력해주세요.";
  }

  if (message.includes("function") || message.includes("schema cache")) {
    return "로그인용 SQL을 먼저 Supabase에서 실행해주세요.";
  }

  return "로그인 처리 중 문제가 발생했습니다.";
}

async function testSupabaseConnection() {
  if (!mafiaSupabaseClient) {
    setConnectionStatus("Supabase 연결 실패", "error");
    return;
  }

  try {
    const response = await fetch(`${window.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: window.SUPABASE_ANON_KEY },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    console.log("Supabase 연결 성공");
    setConnectionStatus("Supabase 연결 성공", "success");
  } catch (error) {
    console.error("Supabase 연결 실패:", error);
    setConnectionStatus("Supabase 연결 실패", "error");
  }
}

async function loadAuthUser() {
  if (!mafiaSupabaseClient || !appSessionToken) {
    currentAuthUser = null;
    renderAuthState();
    return;
  }

  try {
    const user = await callMafiaRpc("get_me", { session_token: appSessionToken });
    currentAuthUser = user;
  } catch (error) {
    console.error("로그인 사용자 확인 실패:", error);
    clearSessionToken();
    currentAuthUser = null;
  }

  renderAuthState();
}

function requireLogin(messageElement) {
  if (currentAuthUser) {
    return true;
  }

  setMessage(messageElement, "로그인 후 이용할 수 있습니다.", "error");
  return false;
}

async function handleLoginSubmit(event) {
  event.preventDefault();

  if (isAuthLoading) {
    return;
  }

  const validation = validateAuthForm();

  if (!validation.isValid) {
    setMessage(homeElements.authMessage, validation.message, "error");
    return;
  }

  setAuthLoading(true);
  setMessage(homeElements.authMessage, "로그인 중...", null);

  try {
    const data = await callMafiaRpc("login_user", {
      user_name: validation.values.username,
      raw_password: validation.values.password,
    });

    saveSessionToken(data.token);
    currentAuthUser = data.user;
    setMessage(homeElements.authMessage, "로그인되었습니다.", "success");
  } catch (error) {
    console.error("로그인 실패:", error);
    setMessage(homeElements.authMessage, getFriendlyAuthError(error), "error");
  } finally {
    setAuthLoading(false);
  }
}

async function handleSignupClick() {
  if (isAuthLoading) {
    return;
  }

  const validation = validateAuthForm();

  if (!validation.isValid) {
    setMessage(homeElements.authMessage, validation.message, "error");
    return;
  }

  setAuthLoading(true);
  setMessage(homeElements.authMessage, "회원가입 중...", null);

  try {
    const data = await callMafiaRpc("signup_user", {
      user_name: validation.values.username,
      raw_password: validation.values.password,
    });

    saveSessionToken(data.token);
    currentAuthUser = data.user;
    setMessage(homeElements.authMessage, "회원가입과 로그인이 완료되었습니다.", "success");
  } catch (error) {
    console.error("회원가입 실패:", error);
    setMessage(homeElements.authMessage, getFriendlyAuthError(error), "error");
  } finally {
    setAuthLoading(false);
  }
}

async function handleLogout() {
  try {
    if (appSessionToken) {
      await callMafiaRpc("logout_user", { session_token: appSessionToken });
    }
  } catch (error) {
    console.error("로그아웃 서버 처리 실패:", error);
  }

  clearSessionToken();
  currentAuthUser = null;
  setMessage(homeElements.authMessage, "로그아웃되었습니다.", "success");
  renderAuthState();
}

async function handleCreateRoomSubmit(event) {
  event.preventDefault();

  if (isCreatingRoom || isJoiningRoom || !requireLogin(homeElements.formMessage)) {
    return;
  }

  const validation = validateNickname(homeElements.createNicknameInput.value);

  if (!validation.isValid) {
    setMessage(homeElements.formMessage, validation.message, "error");
    return;
  }

  setCreateRoomLoading(true);
  setMessage(homeElements.formMessage, "", null);

  try {
    const result = await createRoomWithHost(validation.nickname, currentAuthUser.id);
    setMessage(homeElements.formMessage, "방 생성 성공. 대기실로 이동합니다.", "success");
    window.location.href = `./lobby.html?room=${encodeURIComponent(result.room.room_code)}`;
  } catch (error) {
    console.error("방 생성 실패:", error);
    setMessage(homeElements.formMessage, "방을 만드는 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.", "error");
    setCreateRoomLoading(false);
  }
}

async function handleJoinRoomSubmit(event) {
  event.preventDefault();

  if (isCreatingRoom || isJoiningRoom || !requireLogin(homeElements.joinMessage)) {
    return;
  }

  const nicknameValidation = validateNickname(homeElements.joinNicknameInput.value);
  const roomCodeValidation = validateRoomCode(homeElements.roomCodeInput.value);

  if (!nicknameValidation.isValid) {
    setMessage(homeElements.joinMessage, nicknameValidation.message, "error");
    return;
  }

  if (!roomCodeValidation.isValid) {
    setMessage(homeElements.joinMessage, roomCodeValidation.message, "error");
    return;
  }

  setJoinRoomLoading(true);
  setMessage(homeElements.joinMessage, "", null);

  try {
    const result = await joinRoomByCode(roomCodeValidation.roomCode, nicknameValidation.nickname, currentAuthUser.id);
    setMessage(homeElements.joinMessage, "방 참가 성공. 대기실로 이동합니다.", "success");
    window.location.href = `./lobby.html?room=${encodeURIComponent(result.room.room_code)}`;
  } catch (error) {
    console.error("방 참가 실패:", error);
    setMessage(homeElements.joinMessage, error.message || "방 참가 중 문제가 발생했습니다.", "error");
    setJoinRoomLoading(false);
  }
}

function initializeHomePage() {
  testSupabaseConnection();
  loadAuthUser();

  if (!mafiaSupabaseClient) {
    renderAuthState();
    return;
  }

  homeElements.authForm.addEventListener("submit", handleLoginSubmit);
  homeElements.signupButton.addEventListener("click", handleSignupClick);
  homeElements.logoutButton.addEventListener("click", handleLogout);
  homeElements.createRoomForm.addEventListener("submit", handleCreateRoomSubmit);
  homeElements.joinRoomForm.addEventListener("submit", handleJoinRoomSubmit);
}

initializeHomePage();

}

/* js/lobby.js */
if (document.querySelector("#lobbyContent")) {
  console.log('AUGMENT MAFIA lobby page loaded');
const lobbyElements = {
  connectionStatus: document.querySelector("#lobbyConnectionStatus"),
  message: document.querySelector("#lobbyMessage"),
  loading: document.querySelector("#lobbyLoading"),
  error: document.querySelector("#lobbyError"),
  errorText: document.querySelector("#lobbyErrorText"),
  content: document.querySelector("#lobbyContent"),
  roomCodeText: document.querySelector("#roomCodeText"),
  roomStatusText: document.querySelector("#roomStatusText"),
  currentPlayersText: document.querySelector("#currentPlayersText"),
  maxPlayersText: document.querySelector("#maxPlayersText"),
  createdAtText: document.querySelector("#createdAtText"),
  playerCountText: document.querySelector("#playerCountText"),
  startConditionText: document.querySelector("#startConditionText"),
  playerList: document.querySelector("#playerList"),
  copyRoomCodeButton: document.querySelector("#copyRoomCodeButton"),
  retryButton: document.querySelector("#retryButton"),
  leaveButton: document.querySelector("#leaveButton"),
  readyButton: document.querySelector("#readyButton"),
  startGameButton: document.querySelector("#startGameButton"),
  startGameButtonLabel: document.querySelector("#startGameButton .button-label"),
};

let currentLobbyRoom = null;
let currentLobbyPlayers = [];
let currentLobbyPlayer = null;
let isStartingGame = false;

function setLobbyConnectionStatus(message, type) {
  lobbyElements.connectionStatus.textContent = message;
  lobbyElements.connectionStatus.classList.remove("is-success", "is-error");

  if (type) {
    lobbyElements.connectionStatus.classList.add(`is-${type}`);
  }
}

function showLobbyMessage(message, type) {
  lobbyElements.message.textContent = message;
  lobbyElements.message.classList.remove("is-success", "is-error");

  if (type) {
    lobbyElements.message.classList.add(`is-${type}`);
  }
}

function setLobbyLoading(isLoading) {
  lobbyElements.loading.hidden = !isLoading;
  lobbyElements.content.hidden = isLoading;
  lobbyElements.error.hidden = true;
}

function showLobbyError(message) {
  lobbyElements.loading.hidden = true;
  lobbyElements.content.hidden = true;
  lobbyElements.error.hidden = false;
  lobbyElements.errorText.textContent = message;
}

async function testLobbySupabaseConnection() {
  if (!mafiaSupabaseClient) {
    setLobbyConnectionStatus("Supabase 연결 실패", "error");
    return false;
  }

  try {
    const response = await fetch(`${window.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: window.SUPABASE_ANON_KEY },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    setLobbyConnectionStatus("Supabase 연결 성공", "success");
    return true;
  } catch (error) {
    console.error("Supabase 연결 실패:", error);
    setLobbyConnectionStatus("Supabase 연결 실패", "error");
    return false;
  }
}

function formatRoomStatus(status) {
  if (status === ROOM_STATUS.WAITING) {
    return "대기 중";
  }

  if (status === ROOM_STATUS.STARTING) {
    return "직업 확인";
  }

  if (status === ROOM_STATUS.PLAYING) {
    return "게임 중";
  }

  if (status === ROOM_STATUS.FINISHED) {
    return "종료";
  }

  return status || "-";
}

function formatCreatedAt(createdAt) {
  if (!createdAt) {
    return "-";
  }

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(createdAt));
}

function renderRoomInfo(room) {
  currentLobbyRoom = room;
  lobbyElements.roomCodeText.textContent = room.room_code;
  lobbyElements.roomStatusText.textContent = formatRoomStatus(room.status);
  lobbyElements.currentPlayersText.textContent = String(room.current_players);
  lobbyElements.maxPlayersText.textContent = String(room.max_players);
  lobbyElements.createdAtText.textContent = formatCreatedAt(room.created_at);
}

function getPlayerInitial(nickname) {
  return nickname ? nickname.trim().charAt(0).toUpperCase() : "?";
}

function createBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className || ""}`.trim();
  badge.textContent = text;
  return badge;
}

function renderLobbyPlayers(players) {
  const currentPlayerId = getSavedPlayerId();

  lobbyElements.playerList.textContent = "";
  lobbyElements.playerCountText.textContent = `${players.length}명`;

  players.forEach(function renderPlayer(player) {
    const card = document.createElement("article");
    card.className = "player-card";
    card.classList.toggle("is-ready", Boolean(player.is_ready));
    card.classList.toggle("is-host", Boolean(player.is_host));

    const avatar = document.createElement("div");
    avatar.className = "player-avatar";
    avatar.textContent = getPlayerInitial(player.nickname);

    const info = document.createElement("div");

    const name = document.createElement("p");
    name.className = "player-name";
    name.textContent = player.nickname;

    const badges = document.createElement("div");
    badges.className = "player-badges";

    if (player.is_host) {
      badges.appendChild(createBadge("방장", "is-host"));
    } else {
      badges.appendChild(createBadge(player.is_ready ? "준비 완료" : "대기 중", player.is_ready ? "is-ready" : ""));
    }

    if (player.id === currentPlayerId) {
      badges.appendChild(createBadge("나", "is-me"));
    }

    info.appendChild(name);
    info.appendChild(badges);
    card.appendChild(avatar);
    card.appendChild(info);
    lobbyElements.playerList.appendChild(card);
  });
}

function renderLobbyActions() {
  const isHost = isHostPlayer(currentLobbyRoom, currentLobbyPlayer);
  const validation = canStartGame(currentLobbyRoom, currentLobbyPlayers, currentLobbyPlayer);

  lobbyElements.readyButton.hidden = isHost;
  lobbyElements.readyButton.textContent = currentLobbyPlayer && currentLobbyPlayer.is_ready ? "준비 취소" : "준비하기";
  lobbyElements.readyButton.disabled = !currentLobbyPlayer || currentLobbyRoom.status !== ROOM_STATUS.WAITING;

  lobbyElements.startGameButton.hidden = !isHost;
  lobbyElements.startGameButton.disabled = !validation.canStart || isStartingGame;
  lobbyElements.startConditionText.textContent = isHost
    ? validation.message
    : "방장이 게임을 시작하기를 기다리는 중";
  lobbyElements.startConditionText.classList.toggle("is-success", validation.canStart);
  lobbyElements.startConditionText.classList.toggle("is-error", !validation.canStart);
}

async function loadLobby() {
  const isConnected = await testLobbySupabaseConnection();

  if (!isConnected) {
    showLobbyError("Supabase 연결을 확인할 수 없습니다. 설정값과 네트워크 상태를 확인해주세요.");
    return;
  }

  const roomCode = getCurrentRoomCode();

  if (!roomCode) {
    window.location.href = "./index.html";
    return;
  }

  setLobbyLoading(true);
  showLobbyMessage("", null);

  try {
    const room = await fetchRoomByCode(roomCode);

    if (!room) {
      showLobbyError("존재하지 않는 방입니다. 방 코드를 다시 확인해주세요.");
      return;
    }

    redirectByGameState(room);

    if (room.status !== ROOM_STATUS.WAITING) {
      return;
    }

    const players = await fetchPlayersByRoomId(room.id);
    const currentPlayer = findCurrentPlayer(players);

    if (!currentPlayer) {
      showLobbyError("현재 플레이어가 이 방에 없습니다. 메인 화면에서 다시 참가해주세요.");
      return;
    }

    currentLobbyPlayers = players;
    currentLobbyPlayer = currentPlayer;
    renderRoomInfo(room);
    renderLobbyPlayers(players);
    renderLobbyActions();
    subscribeToLobbyChanges(room.id);

    lobbyElements.loading.hidden = true;
    lobbyElements.error.hidden = true;
    lobbyElements.content.hidden = false;
  } catch (error) {
    console.error("대기실 정보 불러오기 실패:", error);
    showLobbyError("대기실 정보를 불러오는 중 문제가 발생했습니다.");
  }
}

async function refreshLobbyData() {
  if (!currentLobbyRoom) {
    return;
  }

  try {
    const room = await fetchRoomByCode(currentLobbyRoom.room_code);

    if (!room) {
      showLobbyError("방이 삭제되었거나 더 이상 존재하지 않습니다.");
      return;
    }

    redirectByGameState(room);

    if (room.status !== ROOM_STATUS.WAITING) {
      return;
    }

    const players = await fetchPlayersByRoomId(room.id);
    currentLobbyPlayers = players;
    currentLobbyPlayer = findCurrentPlayer(players);
    renderRoomInfo(room);
    renderLobbyPlayers(players);
    renderLobbyActions();
  } catch (error) {
    console.error("대기실 갱신 실패:", error);
    showLobbyMessage("대기실 정보를 갱신하지 못했습니다.", "error");
  }
}

function subscribeToLobbyChanges(roomId) {
  subscribeToRoomChanges(roomId, refreshLobbyData);
  subscribeToPlayerChanges(roomId, refreshLobbyData);
}

async function copyRoomCode() {
  if (!currentLobbyRoom) {
    return;
  }

  try {
    if (!navigator.clipboard) {
      throw new Error("Clipboard API를 사용할 수 없습니다.");
    }

    await navigator.clipboard.writeText(currentLobbyRoom.room_code);
    showLobbyMessage("방 코드가 복사되었습니다.", "success");
  } catch (error) {
    console.error("방 코드 복사 실패:", error);
    showLobbyMessage("복사에 실패했습니다. 화면의 방 코드를 직접 선택해주세요.", "error");
  }
}

async function handleReadyClick() {
  if (!currentLobbyRoom || !currentLobbyPlayer || currentLobbyPlayer.is_host) {
    return;
  }

  lobbyElements.readyButton.disabled = true;

  try {
    await toggleReady(currentLobbyRoom.id, currentLobbyPlayer);
    await refreshLobbyData();
  } catch (error) {
    console.error("준비 상태 변경 실패:", error);
    showLobbyMessage("준비 상태를 바꾸지 못했습니다.", "error");
  } finally {
    renderLobbyActions();
  }
}

async function handleStartGameClick() {
  if (isStartingGame) {
    return;
  }

  isStartingGame = true;
  lobbyElements.startGameButton.disabled = true;
  lobbyElements.startGameButton.classList.add("is-loading");
  lobbyElements.startGameButtonLabel.textContent = "게임 준비 중...";
  showLobbyMessage("게임을 준비하고 있습니다...", "success");

  try {
    await startGame(currentLobbyRoom, currentLobbyPlayers, currentLobbyPlayer);
    window.setTimeout(function moveToGamePage() {
      window.location.href = `./game.html?room=${encodeURIComponent(currentLobbyRoom.room_code)}`;
    }, 700);
  } catch (error) {
    console.error("게임 시작 실패:", error);
    showLobbyMessage(error.message || "게임을 시작하지 못했습니다.", "error");
    isStartingGame = false;
    lobbyElements.startGameButton.classList.remove("is-loading");
    lobbyElements.startGameButtonLabel.textContent = "게임 시작";
    renderLobbyActions();
  }
}

async function handleLeaveClick() {
  if (!currentLobbyRoom || !currentLobbyPlayer || isStartingGame) {
    return;
  }

  try {
    const { error } = await mafiaSupabaseClient
      .from("room_players")
      .delete()
      .eq("room_id", currentLobbyRoom.id)
      .eq("id", currentLobbyPlayer.id);

    if (error) {
      throw error;
    }

    const remainingPlayers = currentLobbyPlayers.filter(function keepOtherPlayer(player) {
      return player.id !== currentLobbyPlayer.id;
    });

    if (currentLobbyPlayer.is_host && remainingPlayers.length > 0) {
      const nextHost = remainingPlayers[0];
      await mafiaSupabaseClient.from("room_players").update({ is_host: true }).eq("id", nextHost.id);
      await mafiaSupabaseClient.from("rooms").update({ host_player_id: nextHost.id }).eq("id", currentLobbyRoom.id);
    }

    if (remainingPlayers.length === 0) {
      await mafiaSupabaseClient.from("rooms").delete().eq("id", currentLobbyRoom.id);
    } else {
      await updateRoomPlayerCount(currentLobbyRoom.id);
    }

    cleanupSubscriptions();
    window.location.href = "./index.html";
  } catch (error) {
    console.error("나가기 실패:", error);
    showLobbyMessage("방을 나가지 못했습니다. 잠시 후 다시 시도해주세요.", "error");
  }
}

function initializeLobbyPage() {
  lobbyElements.retryButton.addEventListener("click", loadLobby);
  lobbyElements.copyRoomCodeButton.addEventListener("click", copyRoomCode);
  lobbyElements.readyButton.addEventListener("click", handleReadyClick);
  lobbyElements.startGameButton.addEventListener("click", handleStartGameClick);
  lobbyElements.leaveButton.addEventListener("click", handleLeaveClick);
  window.addEventListener("beforeunload", cleanupSubscriptions);
  loadLobby();
}

initializeLobbyPage();

}

/* js/game.js */
if (document.querySelector("#gameContent")) {
  console.log('AUGMENT MAFIA game page loaded');
const gameElements = {
  connectionStatus: document.querySelector("#gameConnectionStatus"),
  message: document.querySelector("#gameMessage"),
  loading: document.querySelector("#gameLoading"),
  error: document.querySelector("#gameError"),
  errorText: document.querySelector("#gameErrorText"),
  retryButton: document.querySelector("#gameRetryButton"),
  content: document.querySelector("#gameContent"),
  dayNumberText: document.querySelector("#dayNumberText"),
  phaseTitle: document.querySelector("#phaseTitle"),
  phaseDescription: document.querySelector("#phaseDescription"),
  remainingTimeText: document.querySelector("#remainingTimeText"),
  timerBox: document.querySelector("#timerBox"),
  roleRevealView: document.querySelector("#roleRevealView"),
  roleCardFront: document.querySelector("#roleCardFront"),
  roleCardBack: document.querySelector("#roleCardBack"),
  roleTitle: document.querySelector("#roleTitle"),
  roleDescription: document.querySelector("#roleDescription"),
  mafiaTeamText: document.querySelector("#mafiaTeamText"),
  revealRoleButton: document.querySelector("#revealRoleButton"),
  confirmRoleButton: document.querySelector("#confirmRoleButton"),
  seenWaitingView: document.querySelector("#seenWaitingView"),
  seenCountText: document.querySelector("#seenCountText"),
  showRoleAgainButton: document.querySelector("#showRoleAgainButton"),
  actionArea: document.querySelector("#actionArea"),
  targetList: document.querySelector("#targetList"),
  confirmBox: document.querySelector("#confirmBox"),
  confirmText: document.querySelector("#confirmText"),
  confirmActionButton: document.querySelector("#confirmActionButton"),
  cancelActionButton: document.querySelector("#cancelActionButton"),
  augmentView: document.querySelector("#augmentView"),
  augmentTitle: document.querySelector("#augmentTitle"),
  augmentDescription: document.querySelector("#augmentDescription"),
  augmentCards: document.querySelector("#augmentCards"),
  augmentConfirmBox: document.querySelector("#augmentConfirmBox"),
  augmentConfirmText: document.querySelector("#augmentConfirmText"),
  confirmAugmentButton: document.querySelector("#confirmAugmentButton"),
  cancelAugmentButton: document.querySelector("#cancelAugmentButton"),
  ownedAugmentsButton: document.querySelector("#ownedAugmentsButton"),
  ownedAugmentsPanel: document.querySelector("#ownedAugmentsPanel"),
  ownedAugmentsList: document.querySelector("#ownedAugmentsList"),
  resultPanel: document.querySelector("#resultPanel"),
  resultTitle: document.querySelector("#resultTitle"),
  resultText: document.querySelector("#resultText"),
  nextPhaseButton: document.querySelector("#nextPhaseButton"),
  playerCountText: document.querySelector("#playerCountText"),
  playerList: document.querySelector("#gamePlayerList"),
  chatPlaceholder: document.querySelector("#chatPlaceholder"),
};

let currentGameRoom = null;
let currentGamePlayers = [];
let currentGamePlayer = null;
let selectedTargetId = "";
let selectedAugmentId = "";
let selectedReplaceSlotNumber = null;
let currentAugmentOffer = null;
let pendingActionType = "";
let isRoleVisible = false;
let isSubmitting = false;
let phaseTimerId = null;
let hasRequestedTimerTransition = false;

function setGameConnectionStatus(message, type) {
  gameElements.connectionStatus.textContent = message;
  gameElements.connectionStatus.classList.remove("is-success", "is-error");

  if (type) {
    gameElements.connectionStatus.classList.add(`is-${type}`);
  }
}

function showGameMessage(message, type) {
  gameElements.message.textContent = message;
  gameElements.message.classList.remove("is-success", "is-error");

  if (type) {
    gameElements.message.classList.add(`is-${type}`);
  }
}

function showGameError(message) {
  stopPhaseTimer();
  gameElements.loading.hidden = true;
  gameElements.content.hidden = true;
  gameElements.error.hidden = false;
  gameElements.errorText.textContent = message;
}

function showGameContent() {
  gameElements.loading.hidden = true;
  gameElements.error.hidden = true;
  gameElements.content.hidden = false;
}

async function testGameSupabaseConnection() {
  if (!mafiaSupabaseClient) {
    setGameConnectionStatus("Supabase 연결 실패", "error");
    return false;
  }

  try {
    const response = await fetch(`${window.SUPABASE_URL.replace(/\/$/, "")}/auth/v1/settings`, {
      headers: { apikey: window.SUPABASE_ANON_KEY },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    setGameConnectionStatus("Supabase 연결 성공", "success");
    return true;
  } catch (error) {
    console.error("Supabase 연결 실패:", error);
    setGameConnectionStatus("Supabase 연결 실패", "error");
    return false;
  }
}

function setPhaseHeader(title, description) {
  gameElements.dayNumberText.textContent = `${currentGameRoom.day_number || 1}일차`;
  gameElements.phaseTitle.textContent = title;
  gameElements.phaseDescription.textContent = description;
}

function hidePhaseViews() {
  gameElements.roleRevealView.hidden = true;
  gameElements.actionArea.hidden = true;
  gameElements.augmentView.hidden = true;
  gameElements.confirmBox.hidden = true;
  gameElements.augmentConfirmBox.hidden = true;
  gameElements.resultPanel.hidden = true;
  gameElements.chatPlaceholder.hidden = true;
}

function calculateRemainingTime() {
  if (!currentGameRoom || !currentGameRoom.phase_ends_at) {
    return null;
  }

  const endTime = new Date(currentGameRoom.phase_ends_at).getTime();
  const remainingMs = endTime - Date.now();
  return Math.max(0, Math.ceil(remainingMs / 1000));
}

function formatTime(seconds) {
  if (seconds === null) {
    return "--:--";
  }

  const minutes = Math.floor(seconds / 60);
  const restSeconds = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(restSeconds).padStart(2, "0")}`;
}

function stopPhaseTimer() {
  if (phaseTimerId) {
    window.clearInterval(phaseTimerId);
    phaseTimerId = null;
  }
}

function startPhaseTimer() {
  stopPhaseTimer();
  hasRequestedTimerTransition = false;

  const initialRemaining = calculateRemainingTime();
  gameElements.timerBox.hidden = initialRemaining === null;
  gameElements.remainingTimeText.textContent = formatTime(initialRemaining);

  if (initialRemaining === null) {
    return;
  }

  phaseTimerId = window.setInterval(async function updateTimer() {
    const remaining = calculateRemainingTime();
    gameElements.remainingTimeText.textContent = formatTime(remaining);

    if (remaining === 0 && !hasRequestedTimerTransition) {
      hasRequestedTimerTransition = true;

      try {
        await requestPhaseTransition(currentGameRoom.id, currentGamePlayer.id);
      } catch (error) {
        console.error("타이머 단계 전환 실패:", error);
      }
    }
  }, 1000);
}

function getAlivePlayers() {
  return currentGamePlayers.filter(function isAlive(player) {
    return player.is_alive;
  });
}

function getDeadPlayers() {
  return currentGamePlayers.filter(function isDead(player) {
    return !player.is_alive;
  });
}

function createBadge(text, className) {
  const badge = document.createElement("span");
  badge.className = `badge ${className || ""}`.trim();
  badge.textContent = text;
  return badge;
}

function createPlayerCard(player, revealRole) {
  const card = document.createElement("article");
  card.className = "player-card";

  const avatar = document.createElement("div");
  avatar.className = "player-avatar";
  avatar.textContent = player.player_order ? String(player.player_order) : "?";

  const info = document.createElement("div");
  const name = document.createElement("p");
  name.className = "player-name";
  name.textContent = player.nickname;

  const badges = document.createElement("div");
  badges.className = "player-badges";
  badges.appendChild(createBadge(player.is_alive ? "생존" : "사망", player.is_alive ? "is-ready" : ""));

  if (player.id === currentGamePlayer.id) {
    badges.appendChild(createBadge("나", "is-me"));
  }

  if (player.is_host) {
    badges.appendChild(createBadge("방장", "is-host"));
  }

  if (revealRole) {
    badges.appendChild(createBadge(ROLE_LABELS[player.role] || "-", ""));
  }

  info.appendChild(name);
  info.appendChild(badges);
  card.appendChild(avatar);
  card.appendChild(info);
  return card;
}

function renderPlayerList(revealRoles) {
  const players = currentGamePlayers.slice().sort(function sortPlayers(a, b) {
    return (a.player_order || 0) - (b.player_order || 0);
  });

  gameElements.playerList.textContent = "";
  gameElements.playerCountText.textContent = `${players.length}명`;

  players.forEach(function appendPlayer(player) {
    gameElements.playerList.appendChild(createPlayerCard(player, revealRoles));
  });
}

function getMafiaTeammates() {
  if (!currentGamePlayer || currentGamePlayer.role !== PLAYER_ROLE.MAFIA) {
    return [];
  }

  return currentGamePlayers.filter(function findMafia(player) {
    return player.role === PLAYER_ROLE.MAFIA && player.id !== currentGamePlayer.id;
  });
}

function renderRoleCard(role) {
  gameElements.roleCardBack.className = `role-card__back is-${role}`;
  gameElements.roleTitle.textContent = ROLE_LABELS[role] || role;
  gameElements.roleDescription.textContent = ROLE_DESCRIPTIONS[role] || "";
  gameElements.confirmRoleButton.hidden = Boolean(currentGamePlayer && currentGamePlayer.has_seen_role);

  const teammates = getMafiaTeammates();
  gameElements.mafiaTeamText.textContent = teammates.length
    ? `같은 마피아: ${teammates.map(function getName(player) { return player.nickname; }).join(", ")}`
    : "";
}

function renderRoleReveal() {
  setPhaseHeader("직업 확인", "자신의 직업을 확인하고 완료를 누르세요.");
  hidePhaseViews();
  gameElements.roleRevealView.hidden = false;

  const seenCount = currentGamePlayers.filter(function seen(player) {
    return player.has_seen_role;
  }).length;
  gameElements.seenCountText.textContent = `직업 확인 완료 ${seenCount} / ${currentGamePlayers.length}`;

  renderRoleCard(currentGamePlayer.role);

  if (currentGamePlayer.has_seen_role) {
    gameElements.roleCardFront.hidden = true;
    gameElements.roleCardBack.hidden = true;
    gameElements.seenWaitingView.hidden = false;
    return;
  }

  gameElements.seenWaitingView.hidden = true;
  gameElements.roleCardFront.hidden = isRoleVisible;
  gameElements.roleCardBack.hidden = !isRoleVisible;
}

function renderDiscussionScreen() {
  const isFirstDay = currentGameRoom.day_number === 1;
  setPhaseHeader(
    `${currentGameRoom.day_number}일차 낮`,
    isFirstDay
      ? "토론 시간입니다. 첫날 낮에는 증강을 선택하지 않습니다."
      : "토론 시간입니다."
  );
  hidePhaseViews();
  gameElements.chatPlaceholder.hidden = false;
}

function isSelectableVoteTarget(player) {
  return currentGamePlayer.is_alive && player.is_alive && currentGamePlayer.can_vote;
}

function isSelectableNightTarget(player) {
  if (!currentGamePlayer.is_alive || !player.is_alive) {
    return false;
  }

  if (currentGameRoom.phase === GAME_PHASE.NIGHT_MAFIA) {
    return currentGamePlayer.role === PLAYER_ROLE.MAFIA && player.role !== PLAYER_ROLE.MAFIA;
  }

  if (currentGameRoom.phase === GAME_PHASE.NIGHT_POLICE) {
    return currentGamePlayer.role === PLAYER_ROLE.POLICE && player.id !== currentGamePlayer.id;
  }

  if (currentGameRoom.phase === GAME_PHASE.NIGHT_DOCTOR) {
    return currentGamePlayer.role === PLAYER_ROLE.DOCTOR;
  }

  return false;
}

function createTargetButton(player, label) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "player-card target-card";
  button.disabled = !label;
  button.classList.toggle("is-selected", selectedTargetId === player.id);

  const card = createPlayerCard(player, false);
  button.appendChild(card.firstChild);
  button.appendChild(card.lastChild);

  if (label) {
    button.addEventListener("click", function handleTargetClick() {
      selectedTargetId = player.id;
      gameElements.confirmText.textContent = label.replace("{nickname}", player.nickname);
      gameElements.confirmBox.hidden = false;
      renderCurrentActionTargets();
    });
  }

  return button;
}

function renderCurrentActionTargets() {
  if (currentGameRoom.phase === GAME_PHASE.DAY_VOTE) {
    renderVoteTargets();
    return;
  }

  renderNightTargets();
}

function renderVoteTargets() {
  hidePhaseViews();
  gameElements.actionArea.hidden = false;
  setPhaseHeader(`${currentGameRoom.day_number}일차 낮`, "투표 시간입니다.");

  gameElements.targetList.textContent = "";
  pendingActionType = "vote";

  if (!currentGamePlayer.is_alive || currentGamePlayer.has_voted) {
    gameElements.targetList.textContent = "";
    const notice = document.createElement("p");
    notice.className = "next-step-note";
    notice.textContent = currentGamePlayer.has_voted
      ? "투표를 완료했습니다. 다른 플레이어를 기다리는 중입니다."
      : "사망한 플레이어는 투표할 수 없습니다.";
    gameElements.targetList.appendChild(notice);
    renderVoteProgress();
    return;
  }

  getAlivePlayers().forEach(function appendTarget(player) {
    gameElements.targetList.appendChild(
      createTargetButton(player, "{nickname} 플레이어에게 투표하시겠습니까?")
    );
  });
  renderVoteProgress();
}

function renderVoteProgress() {
  const votedCount = getAlivePlayers().filter(function voted(player) {
    return player.can_vote && player.has_voted;
  }).length;
  const totalCount = getAlivePlayers().filter(function canVote(player) {
    return player.can_vote;
  }).length;
  showGameMessage(`투표 완료 ${votedCount} / ${totalCount}`, "success");
}

function getAugmentSelectionProgress(offerType) {
  const alivePlayers = getAlivePlayers();

  if (offerType === "night") {
    const aliveMafiaPlayers = alivePlayers.filter(function isMafia(player) {
      return player.role === PLAYER_ROLE.MAFIA;
    });

    return {
      completed: aliveMafiaPlayers.filter(function completed(player) {
        return player.night_action_completed;
      }).length,
      total: aliveMafiaPlayers.length,
    };
  }

  return {
    completed: alivePlayers.filter(function completed(player) {
      return player.night_action_completed;
    }).length,
    total: alivePlayers.length,
  };
}

function createAugmentImage(augment) {
  const imageBox = document.createElement("div");
  imageBox.className = "augment-image";

  if (augment.image) {
    const image = document.createElement("img");
    image.src = augment.image;
    image.alt = `${augment.name} 이미지`;
    imageBox.appendChild(image);
    return imageBox;
  }

  imageBox.textContent = "증강 이미지";
  return imageBox;
}

function createAugmentCard(augment, index) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `augment-card is-${augment.rarity}`;
  button.style.animationDelay = `${index * 120}ms`;
  button.classList.toggle("is-fake", Boolean(augment.is_fake));
  button.classList.toggle("is-selected", selectedAugmentId === augment.id);
  button.classList.toggle("is-dimmed", Boolean(selectedAugmentId && selectedAugmentId !== augment.id));

  const meta = document.createElement("div");
  meta.className = "augment-meta";

  const rarity = document.createElement("span");
  rarity.className = `augment-rarity is-${augment.rarity}`;
  rarity.textContent = AUGMENT_RARITY_LABELS[augment.rarity] || augment.rarity;
  meta.appendChild(rarity);

  if (augment.is_fake) {
    const fake = document.createElement("span");
    fake.className = "augment-fake";
    fake.textContent = "가짜 증강";
    meta.appendChild(fake);
  }

  const name = document.createElement("p");
  name.className = "augment-name";
  name.textContent = augment.name;

  const description = document.createElement("p");
  description.className = "augment-description";
  description.textContent = augment.description;

  button.appendChild(createAugmentImage(augment));
  button.appendChild(meta);
  button.appendChild(name);
  button.appendChild(description);

  button.addEventListener("click", function handleAugmentCardClick() {
    if (currentAugmentOffer && currentAugmentOffer.is_completed) {
      return;
    }

    selectedAugmentId = augment.id;
    selectedReplaceSlotNumber = null;
    gameElements.augmentConfirmText.textContent = `${augment.name} 증강을 선택하시겠습니까?`;
    gameElements.augmentConfirmBox.hidden = false;
    renderAugmentCards();
    renderReplacementChoices().catch(function handleReplaceError(error) {
      console.error("교체 선택 표시 실패:", error);
      showGameMessage("보유 증강을 확인하지 못했습니다.", "error");
    });
  });

  return button;
}

function getCurrentOfferAugments() {
  if (!currentAugmentOffer || !Array.isArray(currentAugmentOffer.augment_ids)) {
    return [];
  }

  return currentAugmentOffer.augment_ids
    .map(function mapAugmentId(augmentId) {
      return findAugmentById(augmentId);
    })
    .filter(Boolean);
}

function renderAugmentCards() {
  const augments = getCurrentOfferAugments();
  gameElements.augmentCards.textContent = "";

  augments.forEach(function appendAugment(augment, index) {
    gameElements.augmentCards.appendChild(createAugmentCard(augment, index));
  });
}

async function renderOwnedAugments() {
  gameElements.ownedAugmentsList.textContent = "";

  const owned = await loadOwnedAugments(currentGameRoom.id, currentGamePlayer.id);
  const fakeOwned = currentGamePlayer.role === PLAYER_ROLE.MAFIA
    ? await loadFakeAugments(currentGameRoom.id, currentGamePlayer.id)
    : [];

  const list = document.createElement("div");
  list.className = "owned-list";

  if (owned.length === 0 && fakeOwned.length === 0) {
    const empty = document.createElement("p");
    empty.className = "next-step-note";
    empty.textContent = "보유 중인 증강이 없습니다.";
    gameElements.ownedAugmentsList.appendChild(empty);
    return;
  }

  owned.forEach(function appendOwned(ownedAugment) {
    const augment = findAugmentById(ownedAugment.augment_id);
    const item = document.createElement("div");
    item.className = "owned-item";
    const title = document.createElement("p");
    title.textContent = augment ? augment.name : "알 수 없는 증강";
    const detail = document.createElement("span");
    detail.textContent = `${augment ? AUGMENT_RARITY_LABELS[augment.rarity] : "-"} · ${ownedAugment.acquired_day}일차 획득`;
    item.appendChild(title);
    item.appendChild(detail);
    list.appendChild(item);
  });

  fakeOwned.forEach(function appendFake(fakeAugment) {
    const augment = findAugmentById(fakeAugment.augment_id);
    const item = document.createElement("div");
    item.className = "owned-item";
    const title = document.createElement("p");
    title.textContent = augment ? augment.name : "알 수 없는 가짜 증강";
    const detail = document.createElement("span");
    detail.textContent = `현재 가짜 증강 · ${fakeAugment.selected_day}일차 선택`;
    item.appendChild(title);
    item.appendChild(detail);
    list.appendChild(item);
  });

  gameElements.ownedAugmentsList.appendChild(list);
}

async function renderAugmentScreen() {
  hidePhaseViews();
  gameElements.augmentView.hidden = false;
  gameElements.timerBox.hidden = true;
  selectedAugmentId = "";

  const offerType = getOfferTypeForPlayer(currentGameRoom, currentGamePlayer);

  if (!currentGamePlayer.is_alive) {
    setPhaseHeader(`${currentGameRoom.day_number}일차 낮`, "사망한 플레이어는 증강을 선택할 수 없습니다.");
    gameElements.augmentTitle.textContent = "증강 선택";
    gameElements.augmentDescription.textContent = "다른 플레이어를 기다리는 중입니다.";
    gameElements.augmentCards.textContent = "";
    return;
  }

  if (!offerType) {
    setPhaseHeader(`${currentGameRoom.day_number}일차 밤`, "밤 행동이 시작되기를 기다리는 중입니다.");
    gameElements.augmentTitle.textContent = "대기 중";
    gameElements.augmentDescription.textContent = "밤 행동이 시작되기를 기다리는 중입니다.";
    gameElements.augmentCards.textContent = "";
    return;
  }

  if (currentGamePlayer.night_action_completed) {
    const progress = getAugmentSelectionProgress(currentGameRoom.phase === GAME_PHASE.NIGHT_MAFIA_AUGMENT ? "night" : "day");
    setPhaseHeader(`${currentGameRoom.day_number}일차`, "증강 선택을 완료했습니다.");
    gameElements.augmentTitle.textContent = "선택 완료";
    gameElements.augmentDescription.textContent = `증강 선택 완료 ${progress.completed} / ${progress.total}`;
    gameElements.augmentCards.textContent = "";
    return;
  }

  currentAugmentOffer = await getOrCreateAugmentOffer(currentGameRoom, currentGamePlayer);

  if (!currentAugmentOffer) {
    throw new Error("현재 단계에서는 증강을 선택할 수 없습니다.");
  }

  if (offerType === "mafia_fake") {
    setPhaseHeader(`${currentGameRoom.day_number}일차 낮`, "낮에 보여줄 가짜 증강을 선택하세요.");
    gameElements.augmentTitle.textContent = "가짜 증강 선택";
    gameElements.augmentDescription.textContent = "이 증강은 실제 효과가 없습니다.";
  } else if (offerType === "mafia_real") {
    setPhaseHeader(`${currentGameRoom.day_number}일차 밤`, "실제로 사용할 증강을 선택하세요.");
    gameElements.augmentTitle.textContent = "증강 선택";
    gameElements.augmentDescription.textContent = "마피아 전용 증강 중 하나를 선택하세요.";
  } else {
    setPhaseHeader(`${currentGameRoom.day_number}일차 낮`, "세 가지 증강 중 하나를 선택하세요.");
    gameElements.augmentTitle.textContent = "증강 선택";
    gameElements.augmentDescription.textContent = "세 가지 증강 중 하나를 선택하세요.";
  }

  renderAugmentCards();
  await renderOwnedAugments();
}

async function renderReplacementChoices() {
  const offerType = currentAugmentOffer ? currentAugmentOffer.offer_type : "";

  if (offerType === "mafia_fake") {
    selectedReplaceSlotNumber = null;
    return false;
  }

  const owned = await loadOwnedAugments(currentGameRoom.id, currentGamePlayer.id);

  if (owned.length < 2) {
    selectedReplaceSlotNumber = null;
    return false;
  }

  gameElements.augmentConfirmBox.hidden = false;
  gameElements.augmentConfirmText.textContent = "보유 증강이 2개입니다. 교체할 증강을 선택하세요.";
  gameElements.ownedAugmentsList.textContent = "";

  const list = document.createElement("div");
  list.className = "owned-list";

  owned.forEach(function appendReplacementChoice(ownedAugment) {
    const augment = findAugmentById(ownedAugment.augment_id);
    const button = document.createElement("button");
    button.type = "button";
    button.className = "owned-item target-card";
    button.classList.toggle("is-selected", selectedReplaceSlotNumber === ownedAugment.slot_number);
    button.textContent = `${ownedAugment.slot_number}번: ${augment ? augment.name : "알 수 없는 증강"}`;
    button.addEventListener("click", function handleReplaceChoice() {
      selectedReplaceSlotNumber = ownedAugment.slot_number;
      renderReplacementChoices();
    });
    list.appendChild(button);
  });

  gameElements.ownedAugmentsPanel.hidden = false;
  gameElements.ownedAugmentsList.appendChild(list);
  return true;
}

function renderExecutionResult() {
  hidePhaseViews();
  gameElements.resultPanel.hidden = false;
  gameElements.nextPhaseButton.hidden = false;
  setPhaseHeader("투표 결과", "처형 결과를 확인하세요.");
  gameElements.resultTitle.textContent = "투표 결과";

  const executedPlayer = currentGamePlayers.find(function findExecuted(player) {
    return player.id === currentGameRoom.execution_target_id;
  });

  if (executedPlayer) {
    gameElements.resultText.textContent = `${executedPlayer.nickname}님이 가장 많은 표를 받아 처형되었습니다.`;
  } else {
    gameElements.resultText.textContent = "최다 득표자가 여러 명이어서 아무도 처형되지 않았습니다.";
  }
}

function getNightPhaseTitle() {
  if (currentGameRoom.phase === GAME_PHASE.NIGHT_MAFIA) {
    return "마피아 행동";
  }

  if (currentGameRoom.phase === GAME_PHASE.NIGHT_POLICE) {
    return "경찰 행동";
  }

  return "의사 행동";
}

function getNightActionLabel() {
  if (currentGameRoom.phase === GAME_PHASE.NIGHT_MAFIA) {
    return "{nickname} 플레이어를 공격 대상으로 선택하시겠습니까?";
  }

  if (currentGameRoom.phase === GAME_PHASE.NIGHT_POLICE) {
    return "{nickname} 플레이어를 조사 대상으로 선택하시겠습니까?";
  }

  return "{nickname} 플레이어를 보호 대상으로 선택하시겠습니까?";
}

function playerCanActAtNight() {
  if (!currentGamePlayer.is_alive) {
    return false;
  }

  if (currentGameRoom.phase === GAME_PHASE.NIGHT_MAFIA) {
    return currentGamePlayer.role === PLAYER_ROLE.MAFIA;
  }

  if (currentGameRoom.phase === GAME_PHASE.NIGHT_POLICE) {
    return currentGamePlayer.role === PLAYER_ROLE.POLICE;
  }

  if (currentGameRoom.phase === GAME_PHASE.NIGHT_DOCTOR) {
    return currentGamePlayer.role === PLAYER_ROLE.DOCTOR;
  }

  return false;
}

function renderNightTargets() {
  hidePhaseViews();
  gameElements.actionArea.hidden = false;
  setPhaseHeader(`${currentGameRoom.day_number}일차 밤`, getNightPhaseTitle());
  pendingActionType = "night";
  gameElements.targetList.textContent = "";

  if (!playerCanActAtNight() || currentGamePlayer.night_action_completed) {
    const notice = document.createElement("p");
    notice.className = "next-step-note";
    notice.textContent = currentGamePlayer.night_action_completed
      ? "행동을 완료했습니다. 다른 플레이어를 기다리는 중입니다."
      : "다른 플레이어를 기다리는 중입니다.";
    gameElements.targetList.appendChild(notice);
    return;
  }

  getAlivePlayers().forEach(function appendNightTarget(player) {
    const label = isSelectableNightTarget(player) ? getNightActionLabel() : "";
    gameElements.targetList.appendChild(createTargetButton(player, label));
  });
}

function renderNightResult() {
  hidePhaseViews();
  gameElements.resultPanel.hidden = false;
  gameElements.nextPhaseButton.hidden = false;
  setPhaseHeader("밤 결과", "밤이 끝났습니다.");
  gameElements.resultTitle.textContent = "밤이 끝났습니다.";

  const deadPlayer = currentGamePlayers.find(function findDead(player) {
    return player.id === currentGameRoom.last_dead_player_id;
  });

  gameElements.resultText.textContent = deadPlayer
    ? `${deadPlayer.nickname}님이 사망했습니다.`
    : "이번 밤에는 아무도 사망하지 않았습니다.";
}

function renderReadyScreen(type) {
  hidePhaseViews();
  gameElements.resultPanel.hidden = false;
  gameElements.nextPhaseButton.hidden = false;

  if (type === "day") {
    setPhaseHeader("2일차 낮", "둘째 날에는 증강을 선택할 수 있습니다. 증강 기능은 다음 작업에서 추가됩니다.");
    gameElements.resultTitle.textContent = "2일차 낮";
    gameElements.resultText.textContent = "증강 기능은 다음 작업에서 추가됩니다.";
    gameElements.nextPhaseButton.textContent = "토론 시작";
    return;
  }

  setPhaseHeader("2일차 밤", "둘째 밤부터 마피아는 실제 증강을 선택할 수 있습니다. 증강 기능은 다음 작업에서 추가됩니다.");
  gameElements.resultTitle.textContent = "2일차 밤";
  gameElements.resultText.textContent = "증강 기능은 다음 작업에서 추가됩니다.";
  gameElements.nextPhaseButton.textContent = "밤 행동 시작";
}

function renderGameOver() {
  hidePhaseViews();
  gameElements.resultPanel.hidden = false;
  gameElements.nextPhaseButton.hidden = false;
  gameElements.nextPhaseButton.textContent = "로비로 돌아가기";
  gameElements.timerBox.hidden = true;
  setPhaseHeader("게임 종료", "최종 결과입니다.");
  gameElements.resultTitle.textContent = "게임 종료";
  gameElements.resultText.textContent =
    currentGameRoom.winner === PLAYER_ROLE.MAFIA
      ? "마피아 진영이 승리했습니다."
      : "시민 진영이 승리했습니다.";
}

function renderGameScreen() {
  showGameContent();
  renderPlayerList(currentGameRoom.phase === GAME_PHASE.GAME_OVER);
  gameElements.nextPhaseButton.textContent = "다음으로";

  if (currentGameRoom.phase === GAME_PHASE.ROLE_REVEAL) {
    renderRoleReveal();
  } else if (currentGameRoom.phase === GAME_PHASE.FIRST_DAY) {
    requestPhaseTransition(currentGameRoom.id, currentGamePlayer.id).catch(function logTransitionError(error) {
      console.error("첫날 토론 전환 실패:", error);
    });
  } else if (
    currentGameRoom.phase === GAME_PHASE.DAY_AUGMENT ||
    currentGameRoom.phase === GAME_PHASE.NIGHT_MAFIA_AUGMENT
  ) {
    renderAugmentScreen().catch(function handleAugmentError(error) {
      console.error("증강 화면 표시 실패:", error);
      showGameError("증강 정보를 불러오지 못했습니다.");
    });
  } else if (currentGameRoom.phase === GAME_PHASE.DAY_DISCUSSION) {
    renderDiscussionScreen();
  } else if (currentGameRoom.phase === GAME_PHASE.DAY_VOTE) {
    renderVoteTargets();
  } else if (currentGameRoom.phase === GAME_PHASE.EXECUTION_RESULT) {
    renderExecutionResult();
  } else if (
    currentGameRoom.phase === GAME_PHASE.NIGHT_MAFIA ||
    currentGameRoom.phase === GAME_PHASE.NIGHT_POLICE ||
    currentGameRoom.phase === GAME_PHASE.NIGHT_DOCTOR
  ) {
    renderNightTargets();
  } else if (currentGameRoom.phase === GAME_PHASE.NIGHT_RESULT) {
    renderNightResult();
  } else if (currentGameRoom.phase === GAME_PHASE.SECOND_DAY_READY) {
    renderReadyScreen("day");
  } else if (currentGameRoom.phase === GAME_PHASE.SECOND_NIGHT_READY) {
    renderReadyScreen("night");
  } else if (currentGameRoom.phase === GAME_PHASE.GAME_OVER) {
    renderGameOver();
  } else {
    showGameError("현재 단계는 아직 지원하지 않습니다.");
  }

  startPhaseTimer();
}

async function loadGameState() {
  const isConnected = await testGameSupabaseConnection();

  if (!isConnected) {
    showGameError("Supabase 연결을 확인할 수 없습니다.");
    return;
  }

  const roomCode = getCurrentRoomCode();

  if (!roomCode) {
    window.location.href = "./index.html";
    return;
  }

  try {
    const room = await fetchRoomByCode(roomCode);

    if (!room) {
      showGameError("존재하지 않는 방입니다.");
      return;
    }

    if (room.status === ROOM_STATUS.WAITING) {
      window.location.href = `./lobby.html?room=${encodeURIComponent(room.room_code)}`;
      return;
    }

    const players = await fetchPlayersByRoomId(room.id);
    const player = findCurrentPlayer(players);

    if (!player) {
      showGameError("현재 플레이어가 이 방에 없습니다. 메인 화면에서 다시 참가해주세요.");
      return;
    }

    currentGameRoom = room;
    currentGamePlayers = players;
    currentGamePlayer = player;
    saveCurrentRoom(room, player.id, player.nickname);
    subscribeToGameChanges(room.id);
    renderGameScreen();
  } catch (error) {
    console.error("게임 상태 불러오기 실패:", error);
    showGameError("게임 정보를 불러오는 중 문제가 발생했습니다.");
  }
}

function subscribeToGameChanges(roomId) {
  subscribeToRoomChanges(roomId, loadGameState);
  subscribeToPlayerChanges(roomId, loadGameState);
}

async function confirmSelectedAction() {
  if (!selectedTargetId || isSubmitting) {
    return;
  }

  isSubmitting = true;
  gameElements.confirmActionButton.disabled = true;

  try {
    if (pendingActionType === "vote") {
      await submitVote(currentGameRoom.id, currentGamePlayer.id, selectedTargetId);
      showGameMessage("투표를 완료했습니다. 다른 플레이어를 기다리는 중입니다.", "success");
    } else {
      await submitNightAction(currentGameRoom.id, currentGamePlayer.id, currentGamePlayer.role, selectedTargetId);

      if (currentGamePlayer.role === PLAYER_ROLE.POLICE) {
        const target = currentGamePlayers.find(function findTarget(player) {
          return player.id === selectedTargetId;
        });
        showGameMessage(
          target && target.role === PLAYER_ROLE.MAFIA
            ? "조사 결과: 해당 플레이어는 마피아입니다."
            : "조사 결과: 해당 플레이어는 마피아가 아닙니다.",
          "success"
        );
      } else {
        showGameMessage("행동을 완료했습니다. 다른 플레이어를 기다리는 중입니다.", "success");
      }
    }

    selectedTargetId = "";
    gameElements.confirmBox.hidden = true;
    await loadGameState();
  } catch (error) {
    console.error("행동 제출 실패:", error);
    showGameMessage(error.message || "현재 단계에서는 이 행동을 할 수 없습니다.", "error");
  } finally {
    isSubmitting = false;
    gameElements.confirmActionButton.disabled = false;
  }
}

async function confirmSelectedAugment() {
  if (!selectedAugmentId || !currentAugmentOffer || isSubmitting) {
    return;
  }

  isSubmitting = true;
  gameElements.confirmAugmentButton.disabled = true;

  try {
    const owned = currentAugmentOffer.offer_type === "mafia_fake"
      ? []
      : await loadOwnedAugments(currentGameRoom.id, currentGamePlayer.id);

    if (owned.length >= 2 && !selectedReplaceSlotNumber) {
      throw new Error("교체할 증강을 선택해주세요.");
    }

    await confirmAugmentSelection(
      currentGameRoom.id,
      currentGamePlayer.id,
      currentAugmentOffer.id,
      selectedAugmentId,
      selectedReplaceSlotNumber
    );

    showGameMessage("증강을 선택했습니다. 다른 플레이어를 기다리는 중입니다.", "success");
    selectedAugmentId = "";
    selectedReplaceSlotNumber = null;
    gameElements.augmentConfirmBox.hidden = true;
    await loadGameState();
  } catch (error) {
    console.error("증강 선택 실패:", error);
    showGameMessage(error.message || "증강을 선택하는 중 문제가 발생했습니다.", "error");
  } finally {
    isSubmitting = false;
    gameElements.confirmAugmentButton.disabled = false;
  }
}

async function handleNextPhaseClick() {
  if (currentGameRoom && currentGameRoom.phase === GAME_PHASE.GAME_OVER) {
    window.location.href = `./lobby.html?room=${encodeURIComponent(currentGameRoom.room_code)}`;
    return;
  }

  if (isSubmitting || !currentGameRoom || !currentGamePlayer) {
    return;
  }

  isSubmitting = true;
  gameElements.nextPhaseButton.disabled = true;

  try {
    await requestPhaseTransition(currentGameRoom.id, currentGamePlayer.id);
    await loadGameState();
  } catch (error) {
    console.error("다음 단계 전환 실패:", error);
    showGameMessage("다음 단계로 넘어가지 못했습니다.", "error");
  } finally {
    isSubmitting = false;
    gameElements.nextPhaseButton.disabled = false;
  }
}

function initializeGamePage() {
  gameElements.retryButton.addEventListener("click", loadGameState);
  gameElements.revealRoleButton.addEventListener("click", function handleRevealRoleClick() {
    isRoleVisible = true;
    renderRoleReveal();
  });
  gameElements.confirmRoleButton.addEventListener("click", async function handleConfirmRoleClick() {
    if (isSubmitting) {
      return;
    }

    isSubmitting = true;
    gameElements.confirmRoleButton.disabled = true;

    try {
      await markRoleAsSeen(currentGameRoom.id, currentGamePlayer.id);
      await loadGameState();
    } catch (error) {
      console.error("직업 확인 완료 실패:", error);
      showGameMessage("직업 확인 완료 처리에 실패했습니다.", "error");
    } finally {
      isSubmitting = false;
      gameElements.confirmRoleButton.disabled = false;
    }
  });
  gameElements.showRoleAgainButton.addEventListener("click", function handleShowRoleAgainClick() {
    gameElements.seenWaitingView.hidden = true;
    gameElements.roleCardBack.hidden = false;
    gameElements.confirmRoleButton.hidden = true;
  });
  gameElements.confirmActionButton.addEventListener("click", confirmSelectedAction);
  gameElements.cancelActionButton.addEventListener("click", function handleCancelClick() {
    selectedTargetId = "";
    gameElements.confirmBox.hidden = true;
    renderCurrentActionTargets();
  });
  gameElements.confirmAugmentButton.addEventListener("click", confirmSelectedAugment);
  gameElements.cancelAugmentButton.addEventListener("click", function handleCancelAugmentClick() {
    selectedAugmentId = "";
    selectedReplaceSlotNumber = null;
    gameElements.augmentConfirmBox.hidden = true;
    renderAugmentCards();
  });
  gameElements.ownedAugmentsButton.addEventListener("click", async function handleOwnedAugmentsClick() {
    gameElements.ownedAugmentsPanel.hidden = !gameElements.ownedAugmentsPanel.hidden;

    if (!gameElements.ownedAugmentsPanel.hidden) {
      try {
        await renderOwnedAugments();
      } catch (error) {
        console.error("보유 증강 표시 실패:", error);
        showGameMessage("보유 증강을 불러오지 못했습니다.", "error");
      }
    }
  });
  gameElements.nextPhaseButton.addEventListener("click", handleNextPhaseClick);
  window.addEventListener("beforeunload", cleanupSubscriptions);
  loadGameState();
}

initializeGamePage();

}
