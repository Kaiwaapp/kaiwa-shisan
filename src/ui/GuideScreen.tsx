import { back } from './hooks';
import { Header } from './components';
import { t } from '../i18n';

// 設定 > 使い方ガイド。画面でできることを全部載せる(長押し・ドラッグなど見ただけでは分からない操作も)。
// 画像に番号を付け、番号ごとに短い説明。番号を付けきれない操作は「ほかにできること」に並べる。
// 画像は public/guide/ (見本データで撮った画面)。x,y は画像の中の位置(%)。
// 画面や機能を変えたら画像と番号の位置も撮り直し、ここにも書き足す。文言の英訳は en.ts へ。
// 開いたときだけ読み込む(App.tsx で lazy)。
type Spot = { x: number; y: number; text: string };
/** 長押し(やドラッグ)した後の画面。x,y は長押しした場所(%)で、そこに印を付ける */
type Hold = { img: string; x: number; y: number; text: string };
type Section = { key: string; img?: string; title: string; lead: string; spots?: Spot[]; more?: string[]; holds?: Hold[]; holdMore?: string[] };

const GUIDE: Section[] = [
  {
    key: 'entries', img: 'entries', title: '話題', lead: '話した内容を1件ずつためる画面',
    holds: [
      { img: 'hold-row', x: 46.7, y: 39.4, text: '話題を長押しすると、ピン留め・本文をコピー・フォルダへ移動・削除のメニューが出る' },
      { img: 'hold-dragfolder', x: 46.7, y: 51.7, text: '長押ししたまま動かして、フォルダに重ねるとそのフォルダへ移動' },
      { img: 'hold-folder', x: 46.3, y: 26, text: 'フォルダを長押しすると、名前の変更・移動・削除のメニューが出る' },
      { img: 'hold-fab', x: 88, y: 87.9, text: '＋を長押しすると、話題のほかに人・タグ・フォルダも作れる' },
    ],
    holdMore: [
      '並び順が「手動」のときは、長押ししたまま上下に動かすと並べ替え',
      'PCでは、長押しのかわりに右クリックでも同じメニューが出る',
      'メニューの操作は「選択」から何件かまとめてもできる',
    ],
    spots: [
      { x: 6.4, y: 3.2, text: '★ お気に入りだけを見る' },
      { x: 15.4, y: 2.9, text: 'All フォルダに関係なく全部を見る' },
      { x: 81.4, y: 3.2, text: 'フォルダを作る' },
      { x: 92, y: 3.2, text: '選択：まとめてピン留め・移動・削除' },
      { x: 0, y: 10.1, text: '本文・人・タグで検索（読み仮名でも）' },
      { x: 88, y: 33.7, text: '並べ替え（手動にすると長押しで並べ替え）' },
      { x: 0, y: 38.2, text: '見出しをタップでしまう・開く' },
      { x: 90.1, y: 43.5, text: '☆でお気に入り' },
      { x: 90.1, y: 47.5, text: '本文をコピー' },
      { x: 88, y: 87.9, text: '＋で新しい話題（長押しで人・タグ・フォルダなども作れる）' },
    ],
    more: [
      '話題をタップすると開いて編集できる',
      'フォルダの中で＋を押すと、そのフォルダに話題を作る',
      '消した話題は、フォルダの一覧の「最近削除した項目」から30日間戻せる',
      '長押しの操作の案内は一覧の一番下に出る（「わかった」で消える）',
      '見本には「#見本」タグが付いている。「見本を消す」で消せる（自分で書いた話題は残る）',
      '見本の案内は「今後表示しない」で閉じられる',
    ],
  },
  {
    key: 'editor', img: 'new', title: '話題を書く', lead: '話した内容と相手・タグを入れて保存',
    holds: [
      { img: 'hold-save', x: 91.9, y: 3.4, text: '保存を長押しすると、「保存して戻る」か「保存してこの画面に留まる」を選べる' },
    ],
    spots: [
      { x: 0, y: 10.6, text: 'タイトル（なくてもOK）' },
      { x: 0, y: 27.4, text: '話した内容を書く。スクショを貼り付けると画像として添付' },
      { x: 82.3, y: 40.9, text: '本文をコピー（共有も）して、別の人にも同じ話を' },
      { x: 0, y: 52, text: 'メモ（相手ごとの反応など）' },
      { x: 19.9, y: 64.6, text: '写真やスクショを添付' },
      { x: 0, y: 69.9, text: '話した相手。名前で絞り込み、いなければそのまま追加' },
      { x: 17.9, y: 84.5, text: '最近の人・グループ・タグはタップで選べる' },
      { x: 0, y: 90.1, text: 'タグを付ける' },
      { x: 79.9, y: 3.4, text: '☆でお気に入り' },
      { x: 92, y: 3.4, text: '保存（長押しで「保存してこの画面に留まる」）' },
    ],
    more: [
      '一番下の「最初に話した日」で、話した日を変えられる',
      'グループを相手に選ぶと、グループごと話した相手になる',
      '保存せずにキャンセルすると確認が出る（設定の「全体」でオフにできる）',
      '設定の「話題」で、保存したあとも一覧に戻らずこの画面に留まるようにできる',
      'AI機能をオンにすると、画像の文字起こしやタグ・相手の提案が使える',
      '一番下の「この話題を削除」で削除（30日間は戻せる）',
    ],
  },
  {
    key: 'people', img: 'people', title: '人', lead: '話した相手の一覧',
    holds: [
      { img: 'hold-personrow', x: 30.4, y: 45.9, text: '人を長押しすると、ピン留め・グループに追加・フォルダへ移動・削除のメニューが出る' },
      { img: 'hold-dragperson', x: 30.4, y: 40.2, text: '長押ししたまま動かして、グループのチップに重ねるとグループに追加' },
    ],
    spots: [
      { x: 0, y: 16.2, text: '関係（友達・家族など）で絞り込む' },
      { x: 0, y: 25.7, text: 'グループ。見出しをタップでしまう・開く' },
      { x: 16.9, y: 30.1, text: 'グループを作る' },
      { x: 30.4, y: 40.2, text: '人を開くと、その人に話したことが見られる' },
      { x: 88, y: 87.9, text: '＋で人を追加' },
    ],
    more: [
      '検索欄に名前を入れて、いなければそのまま追加できる',
      '人を長押ししたまま、グループのチップに重ねるとグループに追加',
      'グループを開くと、メンバーの追加や、グループを相手にした話題を作れる',
    ],
  },
  {
    key: 'person', img: 'person', title: '人の画面', lead: 'この人に何を話したか',
    spots: [
      { x: 92, y: 3.4, text: '編集：名前・読み仮名・関係・フォルダ・グループ・メモ' },
      { x: 0, y: 13.2, text: 'プロフィール（年齢・仕事・趣味など）' },
      { x: 0, y: 28.5, text: 'この人との予定' },
      { x: 0, y: 86.7, text: 'この人のToDo' },
      { x: 88, y: 87.9, text: '＋でこの人に話した話題を書く' },
    ],
    more: [
      'その下に、この人に話した話題が並ぶ',
      '同じ人を2回登録したときは、編集の「別の人に統合」で1つにまとめる',
      '編集の一番下で人を削除（話題は残る）',
      'AI機能がオンなら、話題やメモからプロフィールを自動で入れられる',
      'プロフィールの項目と関係の選択肢は、設定の「人」で変えられる',
    ],
  },
  {
    key: 'topics', img: 'topics', title: 'タグ', lead: '話題に付けるタグの一覧',
    spots: [
      { x: 27.7, y: 26.1, text: 'おすすめのタグから選んでまとめて登録' },
      { x: 20, y: 39.2, text: 'タグを開く' },
      { x: 88, y: 87.9, text: '＋でタグを追加' },
    ],
  },
  {
    key: 'topic', img: 'topic', title: 'タグの画面', lead: 'その話を誰にしたか',
    spots: [
      { x: 0, y: 9.6, text: 'このタグを話した相手と回数' },
      { x: 0, y: 18.7, text: 'このタグの話題' },
      { x: 92, y: 3.4, text: '編集：名前・読み仮名・フォルダ・削除' },
    ],
  },
  {
    key: 'schedule', img: 'schedule', title: '予定', lead: '人と会う予定を入れておく',
    spots: [
      { x: 83.5, y: 3.4, text: 'これからの予定をiPhoneなどのカレンダーに追加（.icsファイル）' },
      { x: 50, y: 10, text: '予定とToDoを切り替え' },
      { x: 22, y: 16.6, text: 'カレンダーとリストを切り替え' },
      { x: 83.3, y: 60.7, text: '選んだ日に予定を追加' },
      { x: 88, y: 87.9, text: '＋で予定を追加' },
    ],
    more: [
      '日付をタップすると、その日の予定が下に出る',
      '予定に人を付けると、人の画面にも出る',
      '今日・明日の予定や期限が近いToDoがあると、予定タブのアイコンに赤い数字が出る',
    ],
  },
  {
    key: 'todo', img: 'todo', title: 'ToDo', lead: '予定タブの「ToDo」。やることを書いておく',
    spots: [
      { x: 0, y: 15.4, text: 'やることを入れて追加' },
      { x: 25, y: 20.6, text: '開始日・期限や相手を付けて追加' },
      { x: 88, y: 87.9, text: '＋でToDoを追加' },
    ],
    more: [
      '終わったらチェックで完了',
      '相手を付けたToDoは、人の画面のToDo欄にも出る',
      '開始日・期限を付けたToDoは、予定のカレンダーとリストにも出る',
    ],
  },
  {
    key: 'settings', img: 'settings', title: '設定', lead: '機能の切り替えとデータの管理',
    spots: [
      { x: 0, y: 20.2, text: '言語（日本語・English）と画面の色' },
      { x: 0, y: 28, text: '話題・人・タグ・予定・全体：使う機能のオンオフと細かい設定' },
      { x: 0, y: 59, text: 'AI機能（試作）' },
      { x: 0, y: 67, text: '有料機能（バナー広告を消すなど）' },
      { x: 0, y: 73.1, text: 'メモやLINEなどから話題を取り込む' },
      { x: 0, y: 79.3, text: 'バックアップの書き出し・読み込み' },
      { x: 0, y: 87, text: 'このガイド' },
    ],
    more: [
      '機能をオフにすると画面に出なくなる（データは消えない）',
      '「人」「タグ」では、入力した文字から読み仮名を作るかを選べる',
      '一番下で見本を消す・入れる',
    ],
  },
];

const base = import.meta.env.BASE_URL;

export default function GuideScreen() {
  return (
    <div className="screen">
      <Header title={t('使い方ガイド')} left={<button className="link" onClick={() => back('/settings')}>{t('‹ 戻る')}</button>} />
      <div className="form">
        {GUIDE.map((g) => (
          <section key={g.key} className="panel guide-card">
            <div className="guide-text">
              <h2>{t(g.title)}</h2>
              <p className="muted small">{t(g.lead)}</p>
            </div>
            {g.img && (
              <div className="guide-shot">
                <img src={`${base}guide/${g.img}.webp`} alt={t(g.title)} loading="lazy" width={393} height={852} />
                {g.spots?.map((s, i) => (
                  <span key={i} className="guide-pin" style={{ left: `${s.x}%`, top: `${s.y}%` }}>{i + 1}</span>
                ))}
              </div>
            )}
            {g.spots && (
              <ol className="guide-list">
                {g.spots.map((s, i) => <li key={i}><span className="guide-num">{i + 1}</span>{t(s.text)}</li>)}
              </ol>
            )}
            {g.holds && (
              <div className="guide-holds">
                <h3>{t('長押しすると')}</h3>
                <div className="guide-hold-grid">
                  {g.holds.map((h) => (
                    <figure key={h.img} className="guide-hold">
                      <div className="guide-shot">
                        <img src={`${base}guide/${h.img}.webp`} alt={t(h.text)} loading="lazy" width={393} height={852} />
                        <span className="guide-press" style={{ left: `${h.x}%`, top: `${h.y}%` }} aria-hidden />
                      </div>
                      <figcaption>{t(h.text)}</figcaption>
                    </figure>
                  ))}
                </div>
                {g.holdMore && (
                  <ul className="guide-more">
                    {g.holdMore.map((m) => <li key={m}>{t(m)}</li>)}
                  </ul>
                )}
              </div>
            )}
            {g.more && (
              <ul className="guide-more">
                {g.more.map((m) => <li key={m}>{t(m)}</li>)}
              </ul>
            )}
          </section>
        ))}
        <p className="muted small">{t('データはこの端末の中にあります。設定の「バックアップ」から、ときどき書き出して保存してください。')}</p>
      </div>
    </div>
  );
}
