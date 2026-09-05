document.querySelectorAll('form').forEach(form=>{
  form.addEventListener('submit',event=>{
    const message=form.dataset.confirm;
    if(message&&!window.confirm(message)){event.preventDefault();return;}
    const button=form.querySelector('button[type="submit"],button:not([type])');
    if(button){button.disabled=true;setTimeout(()=>button.disabled=false,3500);}
  });
});

document.querySelectorAll('[data-audio-toggle]').forEach(button=>{
  button.addEventListener('click',async()=>{
    const audio=document.getElementById('profileAudio');
    if(!audio)return;
    if(audio.paused){try{await audio.play();button.textContent='pause audio';}catch{button.textContent='play blocked';}}
    else{audio.pause();button.textContent='play audio';}
  });
});

document.querySelectorAll('.copy-field').forEach(input=>{
  input.addEventListener('click',async()=>{
    input.select();
    try{await navigator.clipboard.writeText(input.value);}catch{}
  });
});
