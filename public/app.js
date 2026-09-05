document.querySelectorAll('form').forEach(form=>{form.addEventListener('submit',()=>{const b=form.querySelector('button');if(b){b.disabled=true;setTimeout(()=>b.disabled=false,3000)}})});
