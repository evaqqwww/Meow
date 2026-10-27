export const BLESSINGS = Object.freeze([
  '愿你今天也有小小的欢喜',
  '愿晚风带来一夜好眠',
  '愿你心里的光一直温柔',
  '愿每一步都走得从容',
  '愿你的辛苦被好好看见',
  '愿寻常日子也藏着惊喜',
  '愿你拥有慢慢来的勇气',
  '愿心上繁杂随风轻轻散',
  '愿你与喜欢的事常相逢',
  '愿疲惫时总有温暖相伴',
  '愿一盏茶的时光很安宁',
  '愿你听见自己的好消息',
  '愿小小心愿被温柔收藏',
  '愿你被春日与猫咪偏爱',
  '愿檐下清风陪你慢慢走',
  '愿一朵云替你捎去问候',
]);

export function pickBlessing({ random = Math.random, exclude = '' } = {}) {
  const candidates = BLESSINGS.filter((blessing) => blessing !== exclude);
  return candidates[Math.floor(random() * candidates.length)];
}
