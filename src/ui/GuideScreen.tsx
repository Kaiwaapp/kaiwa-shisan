import { back } from './hooks';
import { Header } from './components';
import { t } from '../i18n';

// 設定 > 使い方ガイド。画面の構成と使える機能を短くまとめる。
// 機能を足したら GUIDE にも1行足す(英訳は en.ts へ)。
const GUIDE: { title: string; items: string[] }[] = [
  {
    title: '画面の構成',
    items: [
      '記録：話した内容を1件ずつ書いてためる画面。フォルダに分けられます',
      '人：話した相手の一覧。人を開くと、その人に話した記録とプロフィールが見られます',
      '話題：話した内容のテーマの一覧。話題を開くと、その話題の記録と話した相手が見られます',
      '設定：使う機能のオンオフ、人・話題ごとの設定、バックアップ',
    ],
  },
  {
    title: '使える機能',
    items: [
      '右下の＋で新しい記録。開いているフォルダや人・話題が付いた状態で作れます',
      '検索：本文・人・話題で探せます。読み仮名でも探せます',
      '長押し：並べ替え、フォルダへの移動、複数選択、ピン留め、削除',
      '★お気に入りと「All」：見出しの左から、お気に入りやすべての一覧を開けます',
      '人のグループ：人をグループに入れて、記録の相手としてまとめて選べます',
      'コピーボタン：本文をコピーして、別の人に同じ話をするときに使えます',
      'バックアップ：データはこの端末の中にあります。ときどき書き出して保存してください',
    ],
  },
];

export function GuideScreen() {
  return (
    <div className="screen">
      <Header title={t('使い方ガイド')} left={<button className="link" onClick={() => back('/settings')}>{t('‹ 戻る')}</button>} />
      <div className="form">
        {GUIDE.map((g) => (
          <section key={g.title} className="panel">
            <h2>{t(g.title)}</h2>
            <ul className="guide-list">
              {g.items.map((s) => <li key={s}>{t(s)}</li>)}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
