
/*	CONNECTIONS - v20130314.1740
	beltran berrocal 	twitter:@lyricalpolymath
	git download: https://github.com/lyricalpolymath/Meteor-components	
 	
	WHAT IS IT
	This a Meteor Client-Server component that allows to display the number of current clients connected to the page
	if the viewer is a user it will use it's id to store it
	otherwise it will create a temporary id "temp_ljhaihoaiasdqwq" 
	that is used to calculate how many are actually users and how many are non-logged in or registered users.
	It's still hackish and you will see some delays in the actual data: some users will disappear after a while, usually because they have loggedin and the server still need to clear the old id
	
	HOW TO USE:
	simply add one or more of the custom HandleBar Helpers to any of your templates
	{{ ALL_VIEWERS }} 
	{{ ONLY_USERS }} 
	{{ VIEWERS_OF_WHICH_USERS }}
	{{ VIEWERS_AND_USERS }}
	
	STYLE
	you can style the .currViewers .currUsers classes in your css
	
	DEPENDENCIES:
	requires TWITTER BOOSTRAP and JQUERY to correctly style the helper and the tooltip
	but it works even without it
	if you want the sample html to work you should also add the packages accounts-base accounts-passwords accounts-ui
	
	CREDITS:
	based on the meteor.com example parties for the keepalive concept - but improved to account for many bugs of the accounts-ui package
*/

//////////////////////////////////////////////////////////////////////////// CONFIGURABLE VARIABLES (Handle with care)

// IT is vital that the variables stay proportional to each other, otherwise it won't work
// there is a specific rythm to how this is working, so if you want to speed up just dive the variables by the same number

//Client Variables
var keepAliveMilliSeconds = 2000;				//every tot milliseconds send the signal to the server stating that you are alive
//Server variables
var clearViewerCheckEveryMilliseconds = 3000; 	//every tot millisecond the server checks for viewers that aren't connected anymore
var clearAfterTotSeconds = 3; 					//how many seconds have to pass before the missing user is removed



//////////////////////////////////////////////////////////////////////////// MODEL
// {viewerID: string, last_seen: dateNumber }
Connections = new Meteor.Collection("connections");


//////////////////////////////////////////////////////////////////////////// SERVER

if (Meteor.isServer) {
	
  	Meteor.publish("connections", function(){
		return Connections.find({});
	});

	
  	Meteor.startup(function () {
		//console.log("\n\nserver startup MongoTests");
  	});


  	Meteor.methods({
		// this function is called on the server by a setInterval loop on the client
		// it checks if the viewerID exists and updates it "last_seen" time to now
		// if it doesn't exist it creates a temporary id and sends it back to the client to store it in Session variables
		keepAliveViewer : function (viewerID) {
			//console.log("\nkeepAliveViewer viewerID:"+viewerID);
			//if the current page is not a user, generate a temporary unique random id for the viewer "temp_r75cg42x4cuwhfr"
			if(viewerID == null || viewerID == undefined) {
				viewerID = "temp_" + Math.random().toString(36).substring(2);
				//XXX TODO verify that there are no other users in the collection with the same string;
				// maybe hash also the date and ip of the client in there to make it more unique	
			} 
			//generate the current time string to add to the connection
			var last_seen = (new Date()).getTime();
			
			//now that you you have a viewerID - add it to the collection of viewers only if it doesn't already exist ($addToSet)
			if (! Connections.findOne({viewerID: viewerID}) ) {
				Connections.insert({viewerID: viewerID, last_seen: last_seen});
				//console.log("server > addViewer - newViewer added: " + Connections.findOne({viewerID: viewerID}) );
			
			//the viewer is already in the collection - just update it's last seen time
			} else {
				Connections.update({viewerID: viewerID}, {$set :{last_seen: last_seen}});
				//console.log("server > addViewer - UPDATED USER: "+viewerID);
			}
		
			//return the object with the last_seen information too 
			//this is needed because the client also needs to check if the timer hasn't stopped due to some bugs of the accounts-ui package
			var obj = {viewerID: viewerID, last_seen: last_seen}
			//console.log("KeepAliveViewer return: " + JSON.stringify(obj)); 
			return obj;
		},
		
	});
	
	
	// run by the set interval - clears the idle users
	var clearViewerIfNotSeen = function () {
		//console.log("clearViewerIfNotSeen clearAfterTotSeconds:"+clearAfterTotSeconds);
		var now = (new Date()).getTime();
		var selector = {last_seen: {$lt: (now - (clearAfterTotSeconds*1000))}};
		Connections.remove(selector);
	}
	
	//every tot seconds looks for missing users and erases them
	var keepAliveHandle_server  =  Meteor.setInterval(clearViewerIfNotSeen, clearViewerCheckEveryMilliseconds);
	
	//Accounts.onCreateUser(function(options, user){}) ////////////??????????????????? CAN I USE THIS??
}



/////////////////////////////////////////////////////////////////////////// CLIENT

if (Meteor.isClient) {
	
	Meteor.subscribe("connections");
	
	Meteor.startup(function(){
		//console.log("client startup MongoTest");
		
		Meteor.autorun(function() {
			//console.log("client autorun - MongoTest - viewerID: "+Session.get("viewerID") + "  -  userId: "+Meteor.userId())
			
			// the first time the client runs there is no Session variable 
			// force the call to assign even a temporary id and don't wait for the interval to do so
			if(! Session.get("viewerID")){
				//console.log(" client autorun - FIRST RUN - I don't have the viewerID in Session - launch callKeepAlive");
				callKeepAlive();
			}
			
			// if the client just logged in - relaunch the timer
			// this solves a bug with the accounts-ui package that stops every timer when performing the validation test
			// launchKeepAlive deletes and relaunches the ping to the server
			if (Meteor.userId() != undefined && Session.get("viewerID") != Meteor.userId ) {
				//console.log("client autorun - user just loggedin - relaunch the keepalive");
				Session.set("viewerID", Meteor.userId());
				launchKeepAlive();
			}
		});
		
		// CREATE THE HandleBars Helpers - the actual workings are refactored to write only once 
		Handlebars.registerHelper('ALL_VIEWERS', 			function (){ return getViewerAndUsersHtmlString("ALL_VIEWERS") });
		Handlebars.registerHelper('ONLY_USERS', 			function (){ return getViewerAndUsersHtmlString("ONLY_USERS") });
		Handlebars.registerHelper("VIEWERS_OF_WHICH_USERS", function (){ return getViewerAndUsersHtmlString("VIEWERS_OF_WHICH_USERS") });
		Handlebars.registerHelper("VIEWERS_AND_USERS", 		function (){ return getViewerAndUsersHtmlString("VIEWERS_AND_USERS") });
		
	});
	
	//used by the handlebars helpers - to search the connections collection and calculate the users
	var getViewersAndUsers = function () {
		var totViewers = Connections.find({}).count();
		var totTempViewers = Connections.find({viewerID: /^temp/}).count(); //find all those that start with the string "temp"
		var totUsers = totViewers - totTempViewers;
		var vu = {totViewers: totViewers, totUsers: totUsers, totNonUsers: totTempViewers};
		//console.log("returnViewersAndUsers vu:"+ JSON.stringify(vu));
		return vu;
	}
	
	// used by the handlebars helpers - to format the html strings for with the data given by getViewersAndUsers
	// option can be one of the 3: "ALL_VIEWERS"  "ONLY_USERS"  "VIEWERS_AND_USERS"
	var getViewerAndUsersHtmlString = function(option) {
		var vu = getViewersAndUsers();
		var viwerStr 	= '<span class="currViewers" href="#" data-toggle="tooltip" data-title="current viewers" data-placement="top" data-animation="true"><i class="icon-eye-open"></i> ' + vu.totViewers + "</span>"
		var userStr 	= '<span class="currUsers"   href="#" data-toggle="tooltip" data-title="connected users" data-placement="top" data-animation="true"><i class="icon-user"></i> ' + vu.totUsers + "</span>"
		var nonUserStr 	= '<span class="currViewers" href="#" data-toggle="tooltip" data-title="non logged-in" data-placement="top" data-animation="true"><i class="icon-eye-open"></i> ' + vu.totNonUsers + "</span>"
		var result = ""
		if 		(option == "ALL_VIEWERS") 				result = viwerStr;
		else if (option == "ONLY_USERS") 				result = userStr;
		else if (option == "VIEWERS_OF_WHICH_USERS") 	result = viwerStr + " &nbsp|&nbsp " + userStr;
		else if (option == "VIEWERS_AND_USERS") 		result = nonUserStr + " &nbsp+&nbsp " + userStr;
		return new Handlebars.SafeString(result);
	}
	
	//called by the startup and the interval
	var callKeepAlive = function () {
		if (Meteor.status().connected) {
			//console.log('\nkeepalive viewerID:'+ Session.get('viewerID') + "  - Meteor.userId: "+ Meteor.userId() + "\t- last_seen: "+Session.get("last_seen"));
			
			//activate the tooltips of the helper
			// it needs to be done continously because on autorun it doesn't actually work
			$('.currViewers').tooltip();
			$('.currUsers').tooltip();
			
			// DETECT Logout 
			// case: no userId(), yes viewerID, but viewerId doesn't contain the string "temp_"
			var uid = Meteor.userId();
			var vid = Session.get("viewerID");
			if(! uid && vid != undefined && vid.indexOf("temp_") == -1) {
				//console.log("\tcallKeepAlive - client has logged out ")
				Session.set("viewerID", null);
			}
			
			
			//Works for log ins but not for log outs
		   		Meteor.call('keepAliveViewer', Session.get('viewerID'), function(error, result) {
		   				//console.log("keepAlive result: "+ JSON.stringify(result) + "  -  error:"+error);
		   				Session.set("viewerID", result.viewerID);
		   				Session.set("last_seen", result.last_seen);
		   		});
		
			//hack to mantain keep alive active
			//there is a bug in accounts-ui that stops all intervals when you select the password field or get to the validation point of the user name
			//this launches a second check after a specific amount of time (proportional to the other timers) that will verify if the last_seen is too old & relaunch the keepalive function
			Meteor.setTimeout ( verifyKeepAlive , keepAliveMilliSeconds *2.5);
		
		}
	}
	
	// Horrible hack to solve the accounts-ui bug that cancels all intervals
	// if too much time has passed the main keepAlive loop must have been stopped - then relaunch it
	var verifyKeepAlive = function () {
		var now = (new Date()).getTime();
		var timeDiff = now - Session.get("last_seen");
		var ttreshold = keepAliveMilliSeconds *2.3;
		//console.log("verifyKeepAlive timeDiff: "+ timeDiff + " ttreshold: "+ ttreshold);
		if (timeDiff > ttreshold) {
			//console.log("the user is too old - something happened to the timer --------------- restart timer");
			launchKeepAlive();
		}
	}
	
	//stops the current counter if there is already one running and relaunches it
	//this solves a bug with the accounts-ui that when performs validation somehow clears stops all intervals in the current client
	//the condition is checked and launched by client > Meteor.autorun  & by verifyKeepAlive
	var launchKeepAlive = function () {
		//console.log("launchKeepAlive");
		Meteor.clearInterval(keepAliveHandle_client);
		keepAliveHandle_client =  Meteor.setInterval(callKeepAlive, keepAliveMilliSeconds);
	}
	
	  // send keepalives so the server can tell when we go away. - concept taken by 
	  //
	  // XXX this is not a great idiom. meteor server does not yet have a
	  // way to expose connection status to user code. Once it does, this
	  // code can go away.
	var keepAliveHandle_client =  Meteor.setInterval(callKeepAlive, keepAliveMilliSeconds);
	
	
	
  //*********************************************************************** templates
 	
	//---------------- TEMPLATE VARIABLES (ie VIEWS)
 	Template.connectionsTemplate.traceViewer = function () {
 	  return "Current ViewerID: " + Session.get("viewerID") + "  -  totalViewers:"+Connections.find({}).count();
 	};
 	

	//---------------- TEMPLATE EVENTS (ie CONTROLLERS) - CAN BE DELETED They are just for developing
	//*
 	Template.connectionsTemplate.events({
 	  'click input' : function () {
 	    // template data, if any, is available in 'this'
 	    if (typeof console !== 'undefined')
 	      	//console.log("You pressed the button");
			Meteor.clearInterval(keepAliveHandle_client);
 	  		///Meteor.call("keepAliveViewer", "parameter-here")
 	  }
 	});
	//*/




}








































