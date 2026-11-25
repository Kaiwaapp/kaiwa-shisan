// 用意しておく話題のリスト(話題タブの案内・設定から選んでまとめて登録する)。
// マッチングアプリなどで初めて話す相手との会話によく出る話題。reading は読み仮名(検索用)、en は英語表示のときの名前。
export interface PresetTopic { name: string; reading: string; en: string }
export interface PresetCategory { title: string; topics: PresetTopic[] }

const p = (name: string, reading: string, en: string): PresetTopic => ({ name, reading, en });

export const PRESET_TOPICS: PresetCategory[] = [
  { title: '趣味', topics: [
    p('映画', 'えいが', 'Movies'), p('音楽', 'おんがく', 'Music'), p('読書', 'どくしょ', 'Books'), p('ゲーム', 'げーむ', 'Games'),
    p('アニメ', 'あにめ', 'Anime'), p('漫画', 'まんが', 'Manga'), p('スポーツ', 'すぽーつ', 'Sports'), p('カメラ', 'かめら', 'Photography'),
    p('料理', 'りょうり', 'Cooking'), p('カフェ巡り', 'かふぇめぐり', 'Cafe hopping'),
  ] },
  { title: '食べ物', topics: [
    p('好きな食べ物', 'すきなたべもの', 'Favorite food'), p('苦手な食べ物', 'にがてなたべもの', 'Foods I dislike'), p('お酒', 'おさけ', 'Drinks'),
    p('甘いもの', 'あまいもの', 'Sweets'), p('ラーメン', 'らーめん', 'Ramen'), p('行きたいお店', 'いきたいおみせ', 'Places to eat'),
  ] },
  { title: '休日・おでかけ', topics: [
    p('休日の過ごし方', 'きゅうじつのすごしかた', 'Weekends'), p('旅行', 'りょこう', 'Travel'), p('行きたい場所', 'いきたいばしょ', 'Places to visit'),
    p('温泉', 'おんせん', 'Hot springs'), p('アウトドア', 'あうとどあ', 'Outdoors'), p('ドライブ', 'どらいぶ', 'Driving'),
  ] },
  { title: '仕事・学生時代', topics: [
    p('仕事', 'しごと', 'Work'), p('学生時代', 'がくせいじだい', 'School days'), p('部活', 'ぶかつ', 'School clubs'), p('勉強・資格', 'べんきょうしかく', 'Studying'),
  ] },
  { title: '暮らし', topics: [
    p('住んでいる場所', 'すんでいるばしょ', 'Where I live'), p('地元', 'じもと', 'Hometown'), p('家族', 'かぞく', 'Family'),
    p('ペット', 'ぺっと', 'Pets'), p('朝型・夜型', 'あさがたよるがた', 'Morning or night person'),
  ] },
  { title: '恋愛・価値観', topics: [
    p('好きなタイプ', 'すきなたいぷ', 'My type'), p('理想のデート', 'りそうのでーと', 'Ideal date'), p('将来の夢', 'しょうらいのゆめ', 'Future plans'),
    p('大事にしていること', 'だいじにしていること', 'What matters to me'),
  ] },
];
