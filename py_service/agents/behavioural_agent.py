from schemas.types import AgentEvent, BehaviouralResponse

def score_behaviour(events: list[AgentEvent], config: dict) -> BehaviouralResponse:
    clarified_before_coding = False
    run_frequency = 0
    read_errors = False
    adapted_to_curveball = False
    hint_dependence = 0.0
    
    hint_count = 0
    total_messages = 0
    code_runs = 0
    curveball_seen = False
    
    for event in events:
        if event.event_type == "message" and event.actor == "student":
            total_messages += 1
            if event.metadata and event.metadata.get("intent") == "HINT_REQUEST":
                hint_count += 1
            if code_runs == 0 and event.metadata and event.metadata.get("intent") == "CONCEPT_QUESTION":
                clarified_before_coding = True
                
        if event.event_type == "code_run":
            code_runs += 1
            if event.metadata and event.metadata.get("exit_code") != 0:
                read_errors = True
                
        if event.event_type == "curveball":
            curveball_seen = True
            
        if event.event_type == "message" and event.actor == "student" and curveball_seen:
            if event.metadata and event.metadata.get("intent") == "CODE_PASTE":
                adapted_to_curveball = True
                
    run_frequency = code_runs
    if total_messages > 0:
        hint_dependence = hint_count / total_messages
        
    process_quality = 5.0
    if clarified_before_coding: process_quality += 2.0
    if run_frequency > 3: process_quality += 1.0
    if read_errors: process_quality += 2.0
    
    adaptability = 5.0
    if adapted_to_curveball: adaptability = 9.0
    
    independence = max(1.0, 10.0 - (hint_dependence * 10))
    
    signals = {
        "clarified_before_coding": clarified_before_coding,
        "run_frequency": run_frequency,
        "read_errors": read_errors,
        "adapted_to_curveball": adapted_to_curveball,
        "hint_dependence": hint_dependence
    }
    
    return BehaviouralResponse(
        process_quality=min(10.0, process_quality),
        adaptability=adaptability,
        independence=independence,
        signals=signals
    )
