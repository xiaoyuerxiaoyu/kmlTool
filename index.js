var map;
var kmlLayer, kmlSource;
var drawLayer;
var source, features;
var draw, snap;

var albumBucketName = "kmllist";
var bucketRegion = "ap-northeast-1";
var IdentityPoolId = "ap-northeast-1:78c5208f-472f-442a-af0a-c82019fc2907";

AWS.config.update({
  region: bucketRegion,
  credentials: new AWS.CognitoIdentityCredentials({
    IdentityPoolId: IdentityPoolId
  })
});

var s3 = new AWS.S3({
  apiVersion: "2006-03-01",
  params: { Bucket: albumBucketName }
});

const SHAPE_TYPE = {
  Point:'Point',
  Line:'LineString',
}

const lineStyle = new ol.style.Style({
  fill: new ol.style.Fill({//填充样式
      color: "#0070C0",
  }),
  stroke: new ol.style.Stroke({//边界样式
      color: "#0070C0",
      width: 3
  })
});

const pointStyle = new ol.style.Style({
//  image: new ol.style.Circle({
//    radius: 30,
//    fill: new ol.style.Fill({
//      color: '#0070C0',
//    }),
  //  stroke: new ol.style.Stroke({
  //    color: '#0070C0',
  //    width: 2,
  //  }),
//  }),
  image: new ol.style.Icon({
    anchor: [0.5, 0.5],
    crossOrigin: 'anonymous',
    // src: 'http://localhost:8081/point-icon.svg'
    src: 'https://kmllist.s3.ap-northeast-1.amazonaws.com/point-icon.svg'
  }),
});

function initMap() {
  console.log("initMap");

  // 地図作成
  map = new ol.Map({
    layers:[new ol.layer.Tile({
      source: new ol.source.XYZ({
          // Roadmap
          url: 'http://mt0.google.com/vt/lyrs=m&hl=en&x={x}&y={y}&z={z}'
          // Terrain
          // url: 'http://mt0.google.com/vt/lyrs=p&hl=en&x={x}&y={y}&z={z}'
          // Altered roadmap
          // url: 'http://mt0.google.com/vt/lyrs=r&hl=ja&x={x}&y={y}&z={z}'
          // Satellite only
          // url: 'http://mt0.google.com/vt/lyrs=s&hl=en&x={x}&y={y}&z={z}'
          // Terrain only
          // url: 'http://mt0.google.com/vt/lyrs=t&hl=en&x={x}&y={y}&z={z}'
          // Hybrid
          // url: 'http://mt0.google.com/vt/lyrs=y&hl=en&x={x}&y={y}&z={z}'
      })
    })],
    target: document.getElementById('map'),
    view: new ol.View({
      projection:'EPSG:4326',
      center: [132.4579901, 34.390481],
      zoom: 20,
      hash: true,
    }),
  });

  // 描画レイヤー初期化
  initDrawLayer();
}

/**
 * 描画レイヤー初期化
 */
function initDrawLayer() {

  features = new ol.Collection();
  source = new ol.source.Vector({features: features});
  drawLayer = new ol.layer.Vector({
    source: source,
  });

  map.addLayer(drawLayer);
}

/**
 * 初期化
 * 表示中の地図に描画された→と●をすべて消去する。
 */
function clearAll() {
  source.clear();
  map.removeLayer(kmlLayer);
}

/**
 * Pointnoの追加
 */
function addPoint() {
  map.removeInteraction(draw);
  map.removeInteraction(snap);

  draw = new ol.interaction.Draw({
    features: features,
    type: SHAPE_TYPE.Point,
    maxPoints: 2,
  });

  draw.on('drawend', function(e) {  
    e.feature.setStyle(pointStyle);
  });

  map.addInteraction(draw);
  snap = new ol.interaction.Snap({
    features: features,
  });
  map.addInteraction(snap);
}

/**
 * Lineの追加
 */
function addLine() {
  map.removeInteraction(draw);
  map.removeInteraction(snap);

  draw = new ol.interaction.Draw({
    features: features,
    type: SHAPE_TYPE.Line,
    maxPoints: 2,
  });

  draw.on('drawend', function(e) {
    
    // Lineを描画した後、▼を描画する。
    let lineString = e.feature.getGeometry();
    let geometryArray  = [];
    geometryArray.push(lineString);

    let geometryCollection = new ol.geom.GeometryCollection([]);

    let coords = lineString.getCoordinates();
    let lastIndex = coords.length - 1;

    let start = coords[0];
    let end = coords[lastIndex];

    let dx = start[0] - end[0];
    let dy = start[1] - end[1];
    let rotation = Math.atan2(dy, dx);


    let geometry = new ol.geom.Polygon([]);
    const newCoordinates = [];

    const xSize = 0.000008;
    const ySize = 0.000005;
    
    newCoordinates.push(end);
    newCoordinates.push([end[0] + xSize, end[1] - ySize]);
    newCoordinates.push([end[0] + xSize, end[1] + ySize]);
    newCoordinates.push(end);

    newCoordinates.push(newCoordinates[0].slice());

    geometry.setCoordinates([newCoordinates]);
    geometry.rotate(rotation, coords[lastIndex]);

    geometryArray.push(geometry);

    geometryCollection.setGeometries(geometryArray);

    e.feature.setGeometry(geometryCollection)

    e.feature.setStyle(lineStyle);
  });

  map.addInteraction(draw);
  snap = new ol.interaction.Snap({
    features: features,
  });
  map.addInteraction(snap);
}

/**
 * 新しく描画した順に●・矢印をひとつ消去する。押した回数だけ、UNDOできるものとする。
 */
function undo() {
  console.log("UNDO");
  // console.log(source.getFeatures().length);

  let len = source.getFeatures().length;
  if(len > 0) {
    source.removeFeature(source.getFeatures()[len - 1]);
  }
}

/**
 * KMLファイルをロードして、マップに表示する。
 */
function loadKML() {
  let p1 = document.getElementById("popup").classList;
  p1.remove("hidden");
  p1.add("visible");
  let p2 = document.getElementById("obscuring-layer").classList;
  p2.remove("hidden");
  p2.add("visible");

  listKMLFiles();
}

/**
 * KMLファイルをロードする為、AWS S3にのファイル一覧を表示する。
 */
function listKMLFiles() {
    s3.listObjects({  }, function(err, data) {
    if (err) {
      return alert("There was an error listing your KML files: " + err.message);
    } else {
      let files = data.Contents.map(function(s3item) {
        return getHtml([
          "<li>",
          "<span class='popup-link' onclick=\"loadXMLLayer('" + s3item.Key + "')\">",
          s3item.Key.split('.')[0],
          "</span>",
          "</li>"
        ]);
      });
      let message = files.length
        ? getHtml([
            "<p>ファイルを選択してください。</p>",
          ])
        : "<p>KMLファイルがありません。";
        let htmlTemplate = [
        "<h2>KMLファイル一覧</h2>",
        message,
        "<ul>",
        getHtml(files),
        "</ul>",
      ];
      document.getElementById("fileList").innerHTML = getHtml(htmlTemplate);
    }
  });
}

/**
 * KMLファイルをロカールにダウンロードする。
 */
function downloadKML() {
  let p1 = document.getElementById("popup").classList;
  p1.remove("hidden");
  p1.add("visible");
  let p2 = document.getElementById("obscuring-layer").classList;
  p2.remove("hidden");
  p2.add("visible");

  listKMLFilesForDownload();
}

/**
 * KMLファイルをダウンロードする為、AWS S3にのファイル一覧を表示する。
 */
function listKMLFilesForDownload() {

  s3.listObjects({  }, function(err, data) {
  if (err) {
    return alert("There was an error listing your KML files: " + err.message);
  } else {
    let files = data.Contents.map(function(s3item) {
      return getHtml([
        "<li>",
        "<span class='popup-link' onclick=\"download('" + s3item.Key + "')\">",
        s3item.Key.split('.')[0],
        "</span>",
        "</li>"
      ]);
    });
    let message = files.length
      ? getHtml([
          "<p>ファイルを選択してください。</p>",
        ])
      : "<p>KMLファイルがありません。";
      let htmlTemplate = [
      "<h2>KMLファイル一覧</h2>",
      message,
      "<ul>",
      getHtml(files),
      "</ul>",
    ];
    document.getElementById("fileList").innerHTML = getHtml(htmlTemplate);
  }
});
}

/**
 * KMLファイルをロカールにダウンロードする。
 * @param {*} fullpath 
 * @param {*} filename 
 */
function download(filename) {
  const link = document.getElementById('download');

  s3.getObject(
    { Key: filename },
    function (error, data) {
      if (error != null) {
        alert("Failed to retrieve an object: " + error);
      } else {
        // console.log(data.Body);

        let kmlBlob = new Blob([data.Body.toString()], {
          type: 'text/xml;charset=utf-8;',
        });

        // alert("Loaded " + data.ContentLength + " bytes");
        // do something with data.Body
        link.href = URL.createObjectURL(kmlBlob);
        link.download = filename;
        link.click();
      }
    }
  );
}

/**
 * 指定されたKMLファイルをマップに追加する。
 * @param {KMLファイル名} fileName 
 */
function loadXMLLayer(fileName) {

  kmlSource = new ol.source.Vector({
    url: 'https://kmllist.s3.ap-northeast-1.amazonaws.com/' + fileName,
    format: new ol.format.KML({
      dateProjection: 'EPSG: 4326',
      featureProjection: 'EPSG: 3857',
      // extractStyles: false // 至关重要
      extractStyles: true // 至关重要
    }),
    projection: 'EPSG: 4326',
  });

  map.removeLayer(kmlLayer);

  kmlLayer = new ol.layer.Vector({
    source: kmlSource,
  });

  var listenerKey = kmlLayer.getSource().on('change', function(){
    if (kmlLayer.getSource().getState() === 'ready') {    // 判定是否加载完成

      // console.log(kmlLayer.getSource().getFeatures());

      kmlLayer.getSource().un('change', listenerKey); // 注销监听器
    }
  });

  map.addLayer(kmlLayer);

  source.clear();

  let p1 = document.getElementById("popup").classList;
  p1.remove("visible");
  p1.add("hidden");
  let p2 = document.getElementById("obscuring-layer").classList;
  p2.remove("visible");
  p2.add("hidden");
}

/**
 * HTMLのテンプレートを編集する。
 */
function getHtml(template) {
  return template.join('\n');
}

/**
 * ポップアップ画面の定義
 * @param {*} showLinkId 
 * @param {*} hideLinkId 
 * @param {*} popupId 
 * @param {*} darkLayerId 
 */
function register_popup(showLinkId, hideLinkId, popupId, darkLayerId) {

  document.getElementById(darkLayerId).classList.add("obscuring-layer");
  document.getElementById(popupId).classList.add("popup");
  // document.getElementById(showLinkId).classList.add("popup-link");
  document.getElementById(hideLinkId).classList.add("popup-link");

  document.getElementById(hideLinkId).onclick = function() {
      var p1 = document.getElementById(popupId).classList;
      p1.remove("visible");
      p1.add("hidden");
      var p2 = document.getElementById(darkLayerId).classList;
      p2.remove("visible");
      p2.add("hidden");
  }
}

/**
 * KMLファイルとしてAWS S3に保存する。
 * @returns 
 */
function exportKML() {

  let kmlFeatures;

  if(kmlSource != undefined){
    kmlFeatures = kmlSource.getFeatures();
  }

  let drawFeatures = source.getFeatures();
  let outputFeatures = [];

  if(kmlSource != undefined) {
    outputFeatures = [...kmlFeatures];
  }

  if(drawFeatures.length > 0) {
    outputFeatures = [...outputFeatures, ...drawFeatures];
  }

  if(outputFeatures.length == 0){
    alert("保存内容がありません。");
    return;
  }

  let fileName = prompt('ファイル名を入力してください:');

  if(fileName == null){
    return;
  }

  let format = new ol.format.KML(
      {
      'writeStyles': true,
      }
    );

  // console.log(outputFeatures);
  
  const kmlXML = format.writeFeatures(outputFeatures, 'EPSG:4326', 'EPSG:3857');

  let uploadParams = {
    Key: fileName + ".kml",
    Body: kmlXML,
  }

  s3.upload (uploadParams, function (err, data) {
    if (err) {
      // console.log("Error", err);
      alert("Error", err);
    } if (data) {
      // console.log("Upload Success", data.Location);
      alert("Upload Success", data.Location);
    }
  });
}

const circleStyle = new ol.style.Style({
  fill: new ol.style.Fill({//填充样式
    color: "#0070C0",
  }),
  stroke: new ol.style.Stroke({//边界样式
      color: "#0070C0",
      width: 3
  })
});

function addCircle(){

  map.removeInteraction(draw);
  map.removeInteraction(snap);

  draw = new ol.interaction.Draw({
    features: features,
    type: 'Point',
  });

  draw.on('drawend', function(e) {  

    let point = e.feature.getGeometry();

    // console.log(point);

    let coords = point.getCoordinates();
    // console.log(coords);
    // let circleGeom = new ol.geom.Circle(coords, 10, 'XY');
    let circleGeom = new ol.geom.Circle(coords, 0.00001);
    // console.log(circleGeom);
    
    // let geometry = new ol.geom.Polygon([]);
    // geometry.fromCircle(circleGeom, 10);

    let geometry = ol.geom.Polygon.fromCircle(circleGeom, 100);

    // console.log(geometry);

    // ol.geom.Polygon.fromCircle(circleGeom, 10)

    e.feature.setGeometry(geometry)
    e.feature.setStyle(circleStyle);
  });

  map.addInteraction(draw);
  snap = new ol.interaction.Snap({
    features: features,
  });
  map.addInteraction(snap);
}