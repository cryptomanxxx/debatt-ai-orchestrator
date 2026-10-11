// Accept only real ISO calendar dates or timezone-qualified timestamps.
export function validLiteratureTime(value,{requireTime=false}={}) {
  if (typeof value!=='string' || value.length>50) return false;
  const match=value.match(/^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-](\d{2}):(\d{2})))?$/);
  if (!match || (requireTime && match[4]===undefined)) return false;
  const [,y,m,d,h,minute,second,,offsetHour,offsetMinute]=match;
  const year=Number(y),month=Number(m),day=Number(d);
  const leap=year%4===0 && (year%100!==0 || year%400===0);
  const days=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];
  if (year<1 || month<1 || month>12 || day<1 || day>days[month-1]
    || Number(h??0)>23 || Number(minute??0)>59 || Number(second??0)>59
    || Number(offsetHour??0)>15 || Number(offsetMinute??0)>59) return false;
  return Number.isFinite(Date.parse(value));
}
