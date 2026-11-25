import { back } from './hooks';
import { Header } from './components';
import { t } from '../i18n';

// 設定 > 使い方ガイド。画面の画像に番号を付け、番号ごとに短い説明を並べて一目で分かるようにする。
// 画像は public/guide/ (サンプルデータで撮った画面)。x,y は画像の中の位置(%)。
// 画面や機能を変えたら画像と番号の位置も撮り直す。文言の英訳は en.ts へ。
type Spot = { x: number; y: number; text: string };
const GUIDE: { img: string; title: string; lead: string; spots: Spot[] }[] = [
  {
    img: 'entries', title: '記録', lead: '話した内容を1件ずつためる画面',
    spots: [
      { x: 50, y: 10, text: '本文・人・話題で検索（読み仮名でも）' },
      { x: 42, y: 15.5, text: 'フォルダを作って分ける' },
      { x: 90, y: 25.5, text: '☆でお気に入り。長押しで移動・並べ替え・削除' },
      { x: 88, y: 88, text: '＋で新しい記録' },
    ],
  },
  {
    img: 'new', title: '新しい記録', lead: '話した内容と相手・話題を入れて保存',
    spots: [
      { x: 50, y: 26, text: '話した内容を書く' },
      { x: 83, y: 41, text: '本文をコピーして別の人にも同じ話を' },
      { x: 16, y: 72, text: '話した相手。よく使う人はタップで選べる' },
      { x: 16, y: 87.5, text: '話題を付ける' },
      { x: 92, y: 3.4, text: '保存' },
    ],
  },
  {
    img: 'people', title: '人', lead: '話した相手の一覧',
    spots: [
      { x: 16, y: 20.5, text: 'グループでまとめる（記録の相手にまとめて選べる）' },
      { x: 15, y: 30.6, text: '人を開くと、その人に話したことが見られる' },
    ],
  },
  {
    img: 'person', title: '人の画面', lead: 'この人に何を話したか',
    spots: [
      { x: 21, y: 9.5, text: 'プロフィール（年齢・仕事・趣味など）' },
      { x: 18, y: 24, text: 'この人に話した記録' },
      { x: 18, y: 71, text: '関係や好きなもののメモ' },
    ],
  },
  {
    img: 'personedit', title: '人の編集', lead: '人の画面の「編集」から',
    spots: [
      { x: 14, y: 8.8, text: '名前を変える' },
      { x: 21, y: 19.2, text: '読み仮名（ひらがなで検索できる）' },
      { x: 16, y: 38.6, text: 'フォルダとグループ（グループはいくつでも）' },
      { x: 23, y: 49, text: 'メモ' },
      { x: 25, y: 80.6, text: '同じ人を2回登録したときは1つにまとめる' },
    ],
  },
  {
    img: 'topic', title: '話題', lead: 'その話を誰にしたか',
    spots: [
      { x: 29, y: 13.5, text: 'この話題を話した相手' },
      { x: 18, y: 26, text: 'この話題の記録' },
    ],
  },
  {
    img: 'settings', title: '設定', lead: '機能の切り替えとバックアップ',
    spots: [
      { x: 92, y: 33.8, text: '機能とカスタマイズ：機能のオンオフと読み仮名などの設定' },
      { x: 92, y: 40, text: 'このガイド' },
      { x: 30, y: 48, text: 'メモやLINEから記録を取り込む' },
      { x: 19, y: 69.5, text: 'バックアップの書き出し・読み込み' },
    ],
  },
  {
    img: 'features', title: '機能とカスタマイズ', lead: '使わない機能は隠せる（データは消えない）',
    spots: [
      { x: 9, y: 19.4, text: '見出しをタップで折りたたむ' },
      { x: 11, y: 24.8, text: 'チェックを外すと画面に出なくなる' },
      { x: 7, y: 76.4, text: '人・話題・全体・AIのグループごとに並ぶ' },
    ],
  },
];

const base = import.meta.env.BASE_URL;

export function GuideScreen() {
  return (
    <div className="screen">
      <Header title={t('使い方ガイド')} left={<button className="link" onClick={() => back('/settings')}>{t('‹ 戻る')}</button>} />
      <div className="form">
        {GUIDE.map((g) => (
          <section key={g.img} className="panel guide-card">
            <div className="guide-shot">
              <img src={`${base}guide/${g.img}.webp`} alt={t(g.title)} loading="lazy" />
              {g.spots.map((s, i) => (
                <span key={i} className="guide-pin" style={{ left: `${s.x}%`, top: `${s.y}%` }}>{i + 1}</span>
              ))}
            </div>
            <div className="guide-text">
              <h2>{t(g.title)}</h2>
              <p className="muted small">{t(g.lead)}</p>
              <ol className="guide-list">
                {g.spots.map((s, i) => <li key={i}><span className="guide-num">{i + 1}</span>{t(s.text)}</li>)}
              </ol>
            </div>
          </section>
        ))}
        <p className="muted small">{t('データはこの端末の中にあります。設定の「バックアップ」から、ときどき書き出して保存してください。')}</p>
      </div>
    </div>
  );
}
