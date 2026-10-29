/* Paginação apenas visual: os objetos selecionados permanecem no plano integral. */
export const REVIEW_PAGE_SIZE=50;
export const actionGroup=a=>[String(a.row?.classLabel||a.group?.label||'Sem grupo'),a.row?.year??a.group?.year??''].join(' · ');
export function chosenActions(actions=[]){return actions.filter(a=>a.selected&&!a.blocked&&a.kind!=='same')}
export function reviewPage(actions=[],{kind='changes',group='',page=0,size=REVIEW_PAGE_SIZE}={}){
  const filtered=actions.filter(a=>(kind==='all'||kind==='changes'&&a.kind!=='same'||kind===a.kind)&&(!group||actionGroup(a)===group));
  const pageSize=Number.isInteger(size)&&size>0?size:REVIEW_PAGE_SIZE;
  const pages=Math.max(1,Math.ceil(filtered.length/pageSize));
  const index=Math.max(0,Math.min(pages-1,Number.isInteger(page)?page:0));
  return {rows:filtered.slice(index*pageSize,(index+1)*pageSize),page:index,pages,total:filtered.length,
    from:filtered.length?index*pageSize+1:0,to:Math.min((index+1)*pageSize,filtered.length),selected:chosenActions(actions).length};
}
