// Uses only SoundCloud's documented Widget API; never reads the embed's DOM.
export function soundCloudWidgetHtml(url, channel) {
  const widgetUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}&auto_play=false&show_artwork=true`;
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head>
  <body style="margin:0;background:#15111e"><iframe id="sc" credentialless title="SoundCloud playlist reference" width="100%" height="166" scrolling="no" frameborder="no" src="${widgetUrl}" style="pointer-events:none"></iframe>
  <script>
  var finished=false;
  function report(payload) {
    if(finished)return; finished=true; clearTimeout(timer);
    var message=Object.assign({channel:${JSON.stringify(channel)}},payload);
    if(window.ReactNativeWebView)window.ReactNativeWebView.postMessage(JSON.stringify(message));
    else window.parent.postMessage(message,'*');
  }
  var timer=setTimeout(function(){report({error:'SoundCloud could not expose this playlist. Try a pasted track list or JSON metadata.'});},25000);
  function ready(){try{
    var widget=SC.Widget(document.getElementById('sc'));
    widget.bind(SC.Widget.Events.ERROR,function(){report({error:'This SoundCloud playlist is unavailable or cannot be embedded.'});});
    widget.bind(SC.Widget.Events.READY,function(){
      widget.pause(); widget.getSounds(function(sounds){report({sounds:(sounds||[]).slice(0,501).map(function(track){return {
        id:track.id,urn:track.urn,title:track.title,metadata_artist:track.metadata_artist,duration:track.duration,
        artwork_url:track.artwork_url,permalink_url:track.permalink_url,user:track.user?{username:track.user.username,full_name:track.user.full_name}:null
      };})});});
    });
  }catch(e){report({error:'SoundCloud metadata could not be read. Use a track list instead.'});}}
  </script><script src="https://w.soundcloud.com/player/api.js" onload="ready()" onerror="report({error:'Connect to the internet to read SoundCloud metadata.'})"></script></body></html>`;
}
