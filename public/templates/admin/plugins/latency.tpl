<form role="form" class="cdn-settings">
	<div class="row">
		<div class="col-sm-2 col-xs-12 settings-header">General</div>
		<div class="col-sm-10 col-xs-12">
      <div class="input-group">
        <div class="checkbox">
          <label class="mdl-switch mdl-js-switch mdl-js-ripple-effect">
            <input class="mdl-switch__input" type="checkbox" id="enabled" <!-- IF settings.enabled -->checked<!-- ENDIF settings.enabled -->/>
            <span class="mdl-switch__label"><strong>Enable latency recording</strong></span>
          </label>
        </div>
        <p>Must restart to apply changes</p>
      </div>
      <div class="input-group">
        <input type="button" class="btn btn-danger" id="clear" value="Clear Stats" style="margin-bottom: 10px" />
        <p>Clears all of the route statistics from the database</p>
      </div>
		</div>
	</div>
</form>

<table class="table">
  <thead>
    <tr>
      <th>Template</th><th>Average latency [ms]</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td><b>TOTAL AVERAGE</b></td><td>{average}</td>
    </tr>
    <!-- BEGIN latencies -->
    <tr>
      <td>{latencies.name}</td><td>{latencies.average}</td>
    </tr>
    <!-- END latencies -->
  </tbody>
</table>

<button id="save" class="floating-button mdl-button mdl-js-button mdl-button--fab mdl-js-ripple-effect mdl-button--colored">
	<i class="material-icons">save</i>
</button>
