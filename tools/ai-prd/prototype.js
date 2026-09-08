window.addEventListener('message',event=>{
  if(event.source!==parent||event.data?.type!=='prd-prototype'||typeof event.data.html!=='string'||event.data.html.length>102000)return;
  document.querySelector('iframe').srcdoc=event.data.html;
});
