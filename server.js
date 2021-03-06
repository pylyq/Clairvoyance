var express = require('express');
var cors = require('cors');
var app = express();
app.use(cors());
var expressWs = require('express-ws')(app);
var clairvoyanceRouter = require('./expressRoutes/clairvoyanceRouter.js');
const keys = require('./pandaScoreKeys');
var ClientSocket = require('ws');
var port = 4040;
var wager = require('./contractRequests');

var currentMatch = null;
var takingMessages = true;

//====================== REST Routes ==============================//
app.use('/', clairvoyanceRouter); //for REST

app.use(function (req, res, next) {
  return next();
});
 
app.get('/currentMatch', function(req, res){
  res.end(JSON.stringify(currentMatch));
});

app.get('/', function(req, res){
  res.end();
});

//============================ Websocket begins ===============================

var pandaSocket = new ClientSocket('wss://live.test.pandascore.co/matches/28125?token=' + keys.token);

pandaSocket.onmessage = function(event) { 

  if (takingMessages){ //make sure that it doesn't complicate things when writing to blockchain

    try{

      takingMessages = false;

      var tempData = JSON.parse(event.data);

      if(currentMatch == null){

        if(tempData.type != 'hello'){

          currentMatch = wager.requestNewWager();
          currentMatch = updateGameStats(currentMatch, tempData);

        }
        
      } else {

        currentMatch = updateGameStats(currentMatch, tempData);
        currentMatch = wager.getUpdateMoneyPool(currentMatch);

        if(currentMatch.finished){

          wager.requestStopBetting(currentMatch);

          currentMatch.canDistribute = currentMatch.moneyPoolFor > 0 && currentMatch.moneyPoolAgainst > 0;

          currentMatch.canDistribute ? wager.requestDistributeMoney(currentMatch): wager.requestReturnMoney(currentMatch);

          currentMatch = null; // reset game

        } 

      }

    } catch(error) {
      //console.log(error);
    }

    takingMessages = true;

  }

  function updateGameStats (tempMatch, data){

    tempMatch.finished = data.game.finished;
    tempMatch.redTeamName = data.red.name;
    tempMatch.blueTeamName = data.blue.name;
    tempMatch.redTowers = data.red.towers;
    tempMatch.blueTowers = data.blue.towers;
    tempMatch.timestamp = data.current_timestamp;
    tempMatch.bluePlayers = [ 
      data.blue.players.top.name,
      data.blue.players.jun.name,
      data.blue.players.mid.name,
      data.blue.players.adc.name,
      data.blue.players.sup.name
    ];
    tempMatch.redPlayers = [
      data.red.players.top.name,
      data.red.players.jun.name,
      data.red.players.mid.name,
      data.red.players.adc.name,
      data.red.players.sup.name
    ];

    return tempMatch;
  }

};

//=================== Websocket routes =======================/
/*eslint-disable no-console*/
app.ws('/:match_id', function(ws, req) {

  var isOpen = false; //this isn't great but works for my one instance, should be attached to each client probably
  ws.on('open', function open() {
    console.log('connected');
  });

  ws.on('close', function close() {
    isOpen = false;
  });

  ws.on('message', function(msg) {
    isOpen = true;
    setInterval(function() {
      expressWs.getWss().clients.forEach(function each(client){
        if(client.readyState === 1 && isOpen){ //readyState isn't sufficient for some reason
          ws.send(JSON.stringify(currentMatch));
        }
      });
    }, 10000);
  })
  .catch(function (e){
    console(e);
  });

});
 
app.listen(port, function(){
  console.log("Server listening at: " +  port);
});


