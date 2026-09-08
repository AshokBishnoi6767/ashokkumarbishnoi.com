(function () {
  "use strict";
  var visual = document.querySelector("[data-hero-visual]");
  if (!visual || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var raf = null, tx = 0, ty = 0;
  function render(){
    raf = null;
    visual.style.transform = "perspective(1100px) rotateX(" + ty.toFixed(2) + "deg) rotateY(" + tx.toFixed(2) + "deg)";
  }
  visual.addEventListener("pointermove", function(e){
    var r = visual.getBoundingClientRect();
    tx = ((e.clientX-r.left)/r.width-.5)*5;
    ty = ((e.clientY-r.top)/r.height-.5)*-5;
    if (!raf) raf = requestAnimationFrame(render);
  });
  visual.addEventListener("pointerleave", function(){tx=0;ty=0;if(!raf)raf=requestAnimationFrame(render);});
})();
