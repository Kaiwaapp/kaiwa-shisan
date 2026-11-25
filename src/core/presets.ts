// 用意しておく話題のリスト(話題タブの案内・設定から選んでまとめて登録する)。
// マッチングアプリなどで初めて話す相手との会話によく出る話題。reading は読み仮名(検索用)、en は英語表示のときの名前。
export interface PresetTopic { name: string; reading: string; en: string }
export interface PresetCategory { title: string; topics: PresetTopic[] }

const p = (name: string, reading: string, en: string): PresetTopic => ({ name, reading, en });

export const PRESET_TOPICS: PresetCategory[] = [
  { title: '趣味・エンタメ', topics: [
    p('映画', 'えいが', 'Movies'),
    p('音楽', 'おんがく', 'Music'),
    p('ライブ', 'らいぶ', 'Live shows'),
    p('読書', 'どくしょ', 'Books'),
    p('漫画', 'まんが', 'Manga'),
    p('アニメ', 'あにめ', 'Anime'),
    p('ドラマ', 'どらま', 'TV dramas'),
    p('推し活', 'おしかつ', 'Fandom'),
    p('写真', 'しゃしん', 'Photography'),
    p('スポーツ観戦', 'すぽーつかんせん', 'Watching sports'),
    p('筋トレ', 'きんとれ', 'Workouts'),
    p('アート', 'あーと', 'Art'),
  ] },
  { title: 'グルメ', topics: [
    p('料理', 'りょうり', 'Cooking'),
    p('カフェ', 'かふぇ', 'Cafes'),
    p('スイーツ', 'すいーつ', 'Sweets'),
    p('お酒', 'おさけ', 'Drinks'),
    p('ラーメン', 'らーめん', 'Ramen'),
    p('焼肉', 'やきにく', 'Yakiniku'),
    p('寿司', 'すし', 'Sushi'),
    p('パン', 'ぱん', 'Bread'),
    p('コーヒー', 'こーひー', 'Coffee'),
    p('外食', 'がいしょく', 'Eating out'),
  ] },
  { title: '休日・レジャー', topics: [
    p('休日', 'きゅうじつ', 'Days off'),
    p('温泉', 'おんせん', 'Hot springs'),
    p('サウナ', 'さうな', 'Sauna'),
    p('キャンプ', 'きゃんぷ', 'Camping'),
    p('海', 'うみ', 'Beach'),
    p('山', 'やま', 'Mountains'),
    p('ドライブ', 'どらいぶ', 'Driving'),
    p('海外', 'かいがい', 'Abroad'),
    p('季節行事', 'きせつぎょうじ', 'Seasonal events'),
  ] },
  { title: '生活', topics: [
    p('住まい', 'すまい', 'Home'),
    p('地元', 'じもと', 'Hometown'),
    p('家族', 'かぞく', 'Family'),
    p('友達', 'ともだち', 'Friends'),
    p('健康', 'けんこう', 'Health'),
    p('睡眠', 'すいみん', 'Sleep'),
    p('家事', 'かじ', 'Housework'),
    p('ファッション', 'ふぁっしょん', 'Fashion'),
    p('買い物', 'かいもの', 'Shopping'),
  ] },
  { title: '自分のこと・価値観', topics: [
    p('性格', 'せいかく', 'Personality'),
    p('特技', 'とくぎ', 'Skills'),
    p('夢', 'ゆめ', 'Dreams'),
    p('目標', 'もくひょう', 'Goals'),
    p('思い出', 'おもいで', 'Memories'),
    p('子ども時代', 'こどもじだい', 'Childhood'),
    p('失敗談', 'しっぱいだん', 'Mishaps'),
    p('悩み', 'なやみ', 'Worries'),
    p('価値観', 'かちかん', 'Values'),
    p('お金', 'おかね', 'Money'),
    p('将来', 'しょうらい', 'Future'),
  ] },
  { title: '恋愛', topics: [
    p('恋愛観', 'れんあいかん', 'Views on love'),
    p('結婚観', 'けっこんかん', 'Views on marriage'),
    p('好きなタイプ', 'すきなたいぷ', 'My type'),
    p('デート', 'でーと', 'Dates'),
    p('恋バナ', 'こいばな', 'Love stories'),
    p('連絡頻度', 'れんらくひんど', 'Messaging habits'),
    p('記念日', 'きねんび', 'Anniversaries'),
  ] },
];
